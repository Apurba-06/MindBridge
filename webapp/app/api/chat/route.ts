import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import {
  HistoryTurn,
  MODEL_NAME,
  buildCombinedPrompt,
  trySplitEmotionAndReply,
} from "@/lib/emotion";
import { hasCrisisSignal } from "@/lib/safety";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment (.env.local locally, or Vercel project settings)."
    );
  }
  return new GoogleGenAI({ apiKey });
}

function clientKeyFor(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() ?? "unknown";
}

const encoder = new TextEncoder();

export async function POST(req: NextRequest) {
  const clientKey = clientKeyFor(req);
  const rateLimit = checkRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many messages. Please slow down and try again shortly." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
        },
      }
    );
  }

  let body: { message?: string; history?: HistoryTurn[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400 });
  }

  const message = (body.message ?? "").trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required." }), { status: 400 });
  }

  let ai: GoogleGenAI;
  try {
    ai = getClient();
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "Server misconfiguration.";
    return new Response(JSON.stringify({ error: messageText }), { status: 500 });
  }

  // Fast, independent keyword-based crisis check (no LLM call, ~instant).
  // If it fires, the prompt forces the model's own emotion read to crisis
  // level and forces crisis resources into the reply, in the same pass.
  const keywordCrisis = hasCrisisSignal(message);
  const prompt = buildCombinedPrompt(message, history, keywordCrisis);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      let buffer = "";
      let emotionSent = false;

      try {
        const genStream = await ai.models.generateContentStream({
          model: MODEL_NAME,
          contents: prompt,
        });

        for await (const chunk of genStream) {
          if (!chunk.text) continue;

          if (!emotionSent) {
            buffer += chunk.text;
            const split = trySplitEmotionAndReply(buffer);
            if (split) {
              const emotion = split.emotion;
              // Belt-and-suspenders: even if the model didn't follow the
              // safety override instruction, force urgency up so the
              // crisis banner still shows.
              if (keywordCrisis && emotion.urgency < 4) {
                emotion.urgency = 4;
                if (!emotion.subtext) {
                  emotion.subtext = "This message contains language associated with a safety concern.";
                }
              }
              if (emotion.urgency >= 4) {
                console.warn(
                  `[MindBridge] crisis-level signal detected at ${new Date().toISOString()} (keyword=${keywordCrisis}, model_urgency=${emotion.urgency})`
                );
              }
              send({ type: "emotion", emotion });
              emotionSent = true;
              if (split.remainder) send({ type: "chunk", text: split.remainder });
            }
            // else: keep buffering, don't send anything yet — the emotion
            // line is short, so this adds negligible perceived latency.
          } else {
            send({ type: "chunk", text: chunk.text });
          }
        }

        // Model never emitted a recognizable emotion block (format drift).
        // Fail safe: treat the whole buffer as the reply and use defaults.
        if (!emotionSent) {
          const fallbackEmotion = {
            valence: 0,
            arousal: 0,
            urgency: keywordCrisis ? 4 : 1,
            masking: "explicit",
            subtext: keywordCrisis
              ? "This message contains language associated with a safety concern."
              : "",
          };
          send({ type: "emotion", emotion: fallbackEmotion });
          if (buffer) send({ type: "chunk", text: buffer });
        }

        send({ type: "done" });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[MindBridge] generateContentStream failed: ${detail}`);
        if (!emotionSent) {
          send({
            type: "emotion",
            emotion: {
              valence: 0,
              arousal: 0,
              urgency: keywordCrisis ? 4 : 1,
              masking: "explicit",
              subtext: "Unable to analyze this message right now.",
            },
          });
        }

        const isQuotaError = /RESOURCE_EXHAUSTED|429|quota/i.test(detail);
        const friendlyMessage = isQuotaError
          ? "MindBridge has hit its daily message limit for today (the free Gemini API tier caps this at a small number of requests per day). It'll reset, or you can raise the limit by enabling billing on your Google AI Studio project — see https://ai.google.dev/gemini-api/docs/rate-limits."
          : "I'm having trouble responding right now, there may be a connection or API issue on my end. Could you try sending that again?";

        send({
          type: "error",
          message: friendlyMessage,
          // Diagnostic detail, visible in the browser's Network tab
          // response, for identifying causes beyond the common quota case.
          debugDetail: isQuotaError ? undefined : detail,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
