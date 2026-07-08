import { describe, it, expect } from "vitest";
import { stripCodeFence, parseEmotionResponse, isResponseTooGeneric, DEFAULT_EMOTION } from "../emotion";

describe("stripCodeFence", () => {
  it("strips a ```json fence", () => {
    const input = '```json\n{"a":1}\n```';
    expect(stripCodeFence(input)).toBe('{"a":1}');
  });

  it("strips a plain ``` fence", () => {
    const input = '```\n{"a":1}\n```';
    expect(stripCodeFence(input)).toBe('{"a":1}');
  });

  it("leaves unfenced text untouched", () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });
});

describe("parseEmotionResponse", () => {
  it("parses a well-formed emotion JSON response", () => {
    const raw = JSON.stringify({
      valence: -0.5,
      arousal: 0.2,
      urgency: 2,
      masking: "implicit",
      subtext: "feeling flat",
    });
    const result = parseEmotionResponse(raw);
    expect(result).toEqual({
      valence: -0.5,
      arousal: 0.2,
      urgency: 2,
      masking: "implicit",
      subtext: "feeling flat",
    });
  });

  it("parses a fenced JSON response", () => {
    const raw = '```json\n{"valence":1,"arousal":1,"urgency":1,"masking":"explicit","subtext":"good"}\n```';
    const result = parseEmotionResponse(raw);
    expect(result.valence).toBe(1);
    expect(result.subtext).toBe("good");
  });

  it("falls back to DEFAULT_EMOTION on malformed JSON", () => {
    expect(parseEmotionResponse("not json at all")).toEqual(DEFAULT_EMOTION);
  });

  it("falls back to DEFAULT_EMOTION on empty input", () => {
    expect(parseEmotionResponse("")).toEqual(DEFAULT_EMOTION);
  });

  it("fills in missing fields with sane defaults", () => {
    const result = parseEmotionResponse('{"valence": 0.3}');
    expect(result.valence).toBe(0.3);
    expect(result.urgency).toBe(1);
    expect(result.masking).toBe("explicit");
  });
});

describe("isResponseTooGeneric", () => {
  it("flags known platitude phrases", () => {
    expect(isResponseTooGeneric("I understand how you feel. What happened next?")).toBe(true);
    expect(isResponseTooGeneric("You're not alone in this. Can you tell me more?")).toBe(true);
  });

  it("flags responses that don't end in a question", () => {
    expect(isResponseTooGeneric("That sounds like a lot to carry.")).toBe(true);
  });

  it("flags overly long responses", () => {
    const longResponse = Array(60).fill("word").join(" ") + "?";
    expect(isResponseTooGeneric(longResponse)).toBe(true);
  });

  it("accepts a concise, specific, question-ending response", () => {
    const good = "That shift from loving it to not caring at all. When did that change?";
    expect(isResponseTooGeneric(good)).toBe(false);
  });
});
