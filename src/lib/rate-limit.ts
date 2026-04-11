// Simple in-memory sliding-window rate limiter.
// Works per Node instance. For multi-instance serverless deploys, replace with
// a shared store (Redis, Upstash, a Postgres attempts table) — the interface
// here is drop-in compatible.

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Drop expired timestamps
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: max - bucket.timestamps.length,
    retryAfterSec: 0,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

// Periodic sweep to keep the Map from growing forever. Runs every 5 minutes.
// `unref()` so it doesn't keep the Node process alive during tests.
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      // If the newest timestamp is older than 1 hour, drop the bucket entirely
      const newest = bucket.timestamps[bucket.timestamps.length - 1] || 0;
      if (now - newest > 60 * 60 * 1000) {
        buckets.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

/**
 * Returns true if the request's Content-Length header indicates a body
 * larger than `maxBytes`, or if the header is present but unparseable.
 * Missing header returns false — callers that require a limit should combine
 * this with their own body-length check after reading.
 */
export function isBodyTooLarge(req: Request, maxBytes: number): boolean {
  const header = req.headers.get('content-length');
  if (header === null) return false;
  const parsed = Number(header);
  if (!Number.isFinite(parsed) || parsed < 0) return true;
  return parsed > maxBytes;
}
