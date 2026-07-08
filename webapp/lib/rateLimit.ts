/**
 * Basic fixed-window rate limiter, keyed by client IP.
 *
 * IMPORTANT LIMITATION: this state lives in the serverless function's
 * memory, which is NOT shared across regions/instances, and resets on
 * every cold start. It's a reasonable first line of defense against
 * casual abuse, but it is not a substitute for a real distributed limiter
 * (e.g. Upstash Redis + @upstash/ratelimit) if this app gets real traffic
 * or needs airtight limits.
 */
type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 20;

export function checkRateLimit(clientKey: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const existing = buckets.get(clientKey);

  if (!existing || now - existing.windowStart > WINDOW_MS) {
    buckets.set(clientKey, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - existing.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true };
}

// Prevent unbounded memory growth across a long-lived function instance.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
  }
}, WINDOW_MS).unref?.();
