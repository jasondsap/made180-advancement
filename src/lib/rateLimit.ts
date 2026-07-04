import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by Postgres.
 *
 * Chosen over an in-memory limiter because Amplify SSR runs on serverless
 * Lambda: successive requests hit different instances, so process-local counters
 * don't compose. One atomic upsert per call against the `rate_limits` table
 * (migration 0015) gives a correct shared counter.
 *
 * Fails OPEN on any error (missing table, DB blip): throttling is a guardrail,
 * not a correctness invariant, and must never take down checkout or giving.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSecs: number;
}

export async function rateLimit(
  bucket: string,
  opts: { limit: number; windowSecs: number },
): Promise<RateLimitResult> {
  const { limit, windowSecs } = opts;
  try {
    const rows = (await sql`
      INSERT INTO rate_limits (bucket, window_start, count)
      VALUES (${bucket}, now(), 1)
      ON CONFLICT (bucket) DO UPDATE SET
        count = CASE
          WHEN rate_limits.window_start < now() - (${windowSecs} * interval '1 second')
          THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE
          WHEN rate_limits.window_start < now() - (${windowSecs} * interval '1 second')
          THEN now() ELSE rate_limits.window_start END
      RETURNING
        count,
        GREATEST(1, EXTRACT(EPOCH FROM (window_start + (${windowSecs} * interval '1 second') - now())))::int AS reset_in
    `) as unknown as Array<{ count: number; reset_in: number }>;
    const r = rows[0];
    if (!r) return { ok: true, remaining: limit, retryAfterSecs: 0 };
    const over = r.count > limit;
    return {
      ok: !over,
      remaining: Math.max(0, limit - r.count),
      retryAfterSecs: over ? r.reset_in : 0,
    };
  } catch (err) {
    console.error("[rateLimit] failing open:", err);
    return { ok: true, remaining: limit, retryAfterSecs: 0 };
  }
}

/** Best-effort client IP from proxy headers (CloudFront/Amplify set x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Standard 429 with a Retry-After header. */
export function tooManyRequests(retryAfterSecs: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", retryAfter: retryAfterSecs },
    { status: 429, headers: { "retry-after": String(Math.max(1, retryAfterSecs)) } },
  );
}
