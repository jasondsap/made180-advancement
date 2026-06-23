-- ============================================================
-- 0011_engage_segments.sql  ·  Saved segments for Tidings audiences.
--
-- A segment is a named, REUSABLE set of audience criteria (not a frozen list of
-- ids). criteria_json holds the filter spec; the audience is re-evaluated against
-- live constituent/gift data every time a message resolves it (see
-- repositories/engage/audience.resolveAudience, mode='segment'). Consent rules
-- still apply at resolution — a segment can never bypass opt-out/do_not_contact.
-- Org-scoped like every Tidings table.
-- ============================================================

create table engage_segments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  name          text not null,
  description   text,
  criteria_json jsonb not null default '{}'::jsonb,  -- { fundIds?, givingMinCents?, givingMaxCents?, giftSince?, giftUntil?, constituentType? }
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index engage_segments_org_idx on engage_segments (org_id);
