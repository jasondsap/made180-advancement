-- ============================================================
-- 0015_rate_limits.sql  ·  Fixed-window rate-limit counters.
--
-- Backs src/lib/rateLimit.ts. One row per (route + actor) bucket, reused across
-- requests via upsert, so the table size is bounded by distinct clients — not by
-- request volume. Works across serverless instances (Amplify Lambda) where an
-- in-memory limiter would not. The limiter fails OPEN if this table is missing
-- or the query errors, so a limiter problem never takes down a public endpoint.
-- ============================================================

create table rate_limits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- Opportunistic cleanup target: stale buckets not touched in a day.
create index rate_limits_window_idx on rate_limits (window_start);
