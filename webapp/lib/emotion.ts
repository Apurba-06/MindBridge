export type Emotion = {
  valence: number;
  arousal: number;
  urgency: number;
  masking: string;
  subtext: string;
};

export type HistoryTurn = { role: "user" | "assistant"; content: string };

export const DEFAULT_EMOTION: Emotion = {
  valence: 0,
  arousal: 0,
  urgency: 1,
  masking: "explicit",
  subtext: "Unable to analyze this message right now.",
};

export const MODEL_NAME = "gemini-2.5-flash";

/**
 * Strips a leading/trailing ```json or ``` code fence from a model response
 * without mangling the JSON content itself.
 */
export function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Parses a raw model response into a normalized Emotion object.
 * Falls back to DEFAULT_EMOTION on any parse failure.
 */
export function parseEmotionResponse(rawText: string): Emotion {
  try {
    const text = stripCodeFence(rawText);
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

export function isResponseTooGeneric(response: string): boolean {
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

export function buildPrompt(message: string, emotion: Emotion, history: HistoryTurn[]): string {
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
