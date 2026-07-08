import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import {
  Emotion,
  HistoryTurn,
  MODEL_NAME,
  buildPrompt,
  parseEmotionResponse,
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

async function detectEmotion(ai: GoogleGenAI, message: string): Promise<Emotion> {
  const prompt = `
Analyze this message and return ONLY a JSON object, no extra text:
{
  "valence": <-1 to 1, negative to positive>,
  "arousal": <-1 to 1, numb to activated>,
  "urgency": <1 to 5, 1=safe 5=crisis>,
  "masking": <"explicit" or "implicit">,
  "subtext": "<one sentence interpretation>"
}
Message: "${message}"
`;
  try {
    const r = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
    return parseEmotionResponse(r.text ?? "");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[MindBridge] detectEmotion generateContent failed: ${detail}`);
    return parseEmotionResponse("");
  }
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

  // Model-based emotion read, plus an independent keyword-based crisis
  // check that doesn't depend on the LLM call at all. If either signal
  // indicates crisis-level urgency, we treat it as one.
  const emotion = await detectEmotion(ai, message);
  const keywordCrisis = hasCrisisSignal(message);
  if (keywordCrisis && emotion.urgency < 4) {
    emotion.urgency = 4;
    if (!emotion.subtext) {
      emotion.subtext = "This message contains language associated with a safety concern.";
    }
  }

  if (emotion.urgency >= 4) {
    // Deliberately not logging message content — just that a crisis-level
    // signal occurred, and from which detector, for basic operational visibility.
    console.warn(
      `[MindBridge] crisis-level signal detected at ${new Date().toISOString()} (keyword=${keywordCrisis}, model_urgency=${emotion.urgency})`
    );
  }

  const prompt = buildPrompt(message, emotion, history);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      send({ type: "emotion", emotion });

      try {
        const genStream = await ai.models.generateContentStream({
          model: MODEL_NAME,
          contents: prompt,
        });

        // Note: streaming trades away the non-streaming version's
        // "regenerate if too generic" quality check, since retrying after
        // tokens have already reached the client isn't possible without
        // discarding visible output. The prompt's own constraints are the
        // only safety net for response quality in this path.
        for await (const chunk of genStream) {
          if (chunk.text) send({ type: "chunk", text: chunk.text });
        }

        send({ type: "done" });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[MindBridge] generateContentStream failed: ${detail}`);
        send({
          type: "error",
          message:
            "I'm having trouble responding right now, there may be a connection or API issue on my end. Could you try sending that again?",
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
