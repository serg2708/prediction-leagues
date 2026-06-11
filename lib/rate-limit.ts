/**
 * Minimal in-memory fixed-window rate limiter. Zero-dependency; protects a
 * single warm serverless instance against single-source floods. For
 * distributed limiting across instances, swap the Map for Upstash Redis.
 */
import type { NextRequest } from "next/server";

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

// Opportunistic cleanup so the Map can't grow unbounded on a long-lived instance.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfter: number };

/** Allow `limit` requests per `windowMs` for the given key. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
