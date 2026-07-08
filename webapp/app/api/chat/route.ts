import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const MODEL_NAME = "gemini-2.5-flash";

type Emotion = {
  valence: number;
  arousal: number;
  urgency: number;
  masking: string;
  subtext: string;
};

type HistoryTurn = { role: "user" | "assistant"; content: string };

const DEFAULT_EMOTION: Emotion = {
  valence: 0,
  arousal: 0,
  urgency: 1,
  masking: "explicit",
  subtext: "Unable to analyze this message right now.",
};

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment (.env.local locally, or Vercel project settings)."
    );
  }
  return new GoogleGenAI({ apiKey });
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
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
    const text = stripCodeFence(r.text ?? "");
    const parsed = JSON.parse(text);
    return {
      valence: Number(parsed.valence ?? 0),
      arousal: Number(parsed.arousal ?? 0),
      urgency: Number(parsed.urgency ?? 1),
      masking: parsed.masking ?? "explicit",
      subtext: parsed.subtext ?? "",
    };
  } catch {
    return { ...DEFAULT_EMOTION };
  }
}

function isResponseTooGeneric(response: string): boolean {
  const genericPhrases = [
    "i understand how you feel",
    "that must be hard",
    "thank you for sharing",
    "i hear you",
    "you're not alone",
    "your feelings are valid",
    "it's okay to feel",
    "thank you for trusting me",
  ];
  const lower = response.toLowerCase();
  if (genericPhrases.some((p) => lower.includes(p))) return true;
  if (!response.trim().endsWith("?")) return true;
  if (response.trim().split(/\s+/).length > 50) return true;
  return false;
}

function buildPrompt(message: string, emotion: Emotion, history: HistoryTurn[]): string {
  const recent = history.slice(-6);
  const historyText = recent
    .map((h) => `${h.role === "user" ? "User" : "MindBridge"}: ${h.content}`)
    .join("\n");

  const crisisRule =
    emotion.urgency >= 4
      ? `CRISIS PROTOCOL:
You MUST include: "Please call or text 988 (Suicide & Crisis Lifeline) or text HOME to 741741."
Then continue and end with a question.`
      : "No crisis - proceed normally";

  return `
You are MindBridge — an emotionally intelligent mental health companion.

CRITICAL RULES:
- NO platitudes like "I understand how you feel" or "That must be hard"
- NO giving advice unless explicitly asked
- DO NOT suggest journaling, breathing exercises, or techniques
- ALWAYS end your response with a genuine, specific question
- Be concise: 2-3 sentences max, then the question

CRISIS RULE (if urgency >=4):
${crisisRule}

RESPONSE STRUCTURE (FOLLOW THIS EXACTLY):
1. Acknowledge what they said (be specific, reference their words)
2. Ask ONE probing question that shows you understood

EXAMPLES OF GOOD RESPONSES:

User: "I just can't be bothered anymore. I used to love going out, playing sports."
Response: "That shift from enjoying things to not finding a reason to get up. When did things start feeling this way?"

User: "My parents are having a rough time and my exams didn't go well."
Response: "You were carrying pressure while watching things at home fall apart. Do you feel like doing well was somehow connected to fixing things at home?"

User: "I skipped a few lectures. It's whatever."
Response: "'It's whatever' is doing a lot of work there. What thought goes through your head right before you decide not to go?"

[CONVERSATION HISTORY]
${historyText}

[EMOTION STATE]
Valence=${emotion.valence} | Arousal=${emotion.arousal} | Urgency=${emotion.urgency}/5

[USER MESSAGE]
${message}

Now respond as MindBridge (2-3 sentences + a question, NO advice):
`;
}

async function getResponse(
  ai: GoogleGenAI,
  message: string,
  emotion: Emotion,
  history: HistoryTurn[]
): Promise<string> {
  const prompt = buildPrompt(message, emotion, history);
  try {
    let r = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
    let response = (r.text ?? "").trim();

    if (isResponseTooGeneric(response)) {
      const retryPrompt =
        prompt +
        "\n\nIMPORTANT: Your previous response was too generic or didn't end with a question. Please try again: Be specific, reference what the user said, and end with a question. NO advice, NO platitudes. Just acknowledgment + question.";
      r = await ai.models.generateContent({ model: MODEL_NAME, contents: retryPrompt });
      response = (r.text ?? "").trim();
    }

    return response;
  } catch {
    return "I'm having trouble responding right now, there may be a connection or API issue on my end. Could you try sending that again?";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = body.message ?? "";
    const history: HistoryTurn[] = Array.isArray(body.history) ? body.history : [];

    if (!message.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const ai = getClient();
    const emotion = await detectEmotion(ai, message);
    const response = await getResponse(ai, message, emotion, history);

    return NextResponse.json({ emotion, response });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "Unknown server error.";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
