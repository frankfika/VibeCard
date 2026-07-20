/**
 * In-memory token-bucket rate limiting (task 5.7).
 *
 * Protects the unauthenticated visitor endpoints (chat + request submission).
 * Per-process and deliberately simple — this is a single-owner self-hosted
 * server; deployments behind a proxy can add their own edge limiting.
 */

export interface RateLimiter {
  /** Consume one token. Returns true when the request may proceed. */
  allow(key: string): boolean;
  /** Seconds until the next token refills (for Retry-After). */
  retryAfterSeconds(key: string): number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export function createRateLimiter(options: {
  perHour: number;
  now?: () => number;
  /** Maximum tracked keys before oldest buckets are evicted. */
  maxKeys?: number;
}): RateLimiter {
  const perHour = Math.max(1, options.perHour);
  const refillPerMs = perHour / 3_600_000;
  const now = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? 10_000;
  const buckets = new Map<string, Bucket>();

  function bucketFor(key: string): Bucket {
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxKeys) {
        // Evict the stalest bucket to bound memory.
        let oldestKey: string | null = null;
        let oldest = Infinity;
        for (const [k, b] of buckets) {
          if (b.updatedAt < oldest) {
            oldest = b.updatedAt;
            oldestKey = k;
          }
        }
        if (oldestKey !== null) buckets.delete(oldestKey);
      }
      bucket = { tokens: perHour, updatedAt: now() };
      buckets.set(key, bucket);
    }
    const elapsed = now() - bucket.updatedAt;
    if (elapsed > 0) {
      bucket.tokens = Math.min(perHour, bucket.tokens + elapsed * refillPerMs);
      bucket.updatedAt = now();
    }
    return bucket;
  }

  return {
    allow(key) {
      const bucket = bucketFor(key);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return true;
      }
      return false;
    },
    retryAfterSeconds(key) {
      const bucket = bucketFor(key);
      if (bucket.tokens >= 1) return 0;
      return Math.ceil((1 - bucket.tokens) / refillPerMs / 1000);
    },
  };
}
