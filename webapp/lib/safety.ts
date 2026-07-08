/**
 * Lightweight, dependency-free crisis signal check.
 *
 * This exists as a safety net alongside the LLM-based emotion detector:
 * if the Gemini call fails, times out, or simply misses something, this
 * keyword check still has a chance to catch clearly high-risk language and
 * surface crisis resources. It is intentionally conservative (favors some
 * false positives over missing a genuine crisis) and intentionally simple
 * (no external ML dependency, runs synchronously, never fails).
 *
 * This is a supplement to, not a replacement for, the model-based
 * detection in lib/emotion.ts — either signal firing should be treated
 * as urgency >= 4.
 */
const HIGH_RISK_PATTERNS: RegExp[] = [
  /\bkill myself\b/i,
  /\bend (my|it all)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bwant to die\b/i,
  /\bdon'?t want to (live|be alive|exist)\b/i,
  /\bno reason to (live|go on)\b/i,
  /\bcan'?t (go on|do this anymore)\b/i,
  /\bself[\s-]?harm\b/i,
  /\bhurt(ing)? myself\b/i,
  /\bbetter off (dead|without me)\b/i,
  /\bgoodbye forever\b/i,
];

export function hasCrisisSignal(message: string): boolean {
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(message));
}

export const CRISIS_MESSAGE =
  "Please call or text 988 (Suicide & Crisis Lifeline) or text HOME to 741741 (Crisis Text Line). You don't have to go through this alone.";
