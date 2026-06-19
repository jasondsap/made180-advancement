-- ============================================================
-- 0003_users_memberships_and_fixes.sql  ·  MADe180 Advancement Platform
-- Append-only additions agreed in pre-build review:
--   1. users + memberships (Cognito identity -> org -> role)
--   2. receipt_counters (atomic sequential receipt numbers)
--   3. gifts.stripe_invoice_id (recurring idempotency)
--   4. gifts.fee_cents / net_cents (cover-fees + net reporting)
--   5. webhook_events.org_id (tenancy rule: every table carries org_id)
--   6. auto-maintained updated_at on constituents + users
-- ============================================================

-- ---------- 1. identity: users + memberships ----------
-- A user is a person who can sign into the admin app, keyed to their Cognito
-- identity. super_admin is a platform-level (cross-org) flag; per-org access and
-- the org_admin/org_staff distinction live on memberships.
create table users (
  id              uuid primary key default gen_random_uuid(),
  cognito_sub     text not null unique,
  email           text not null,
  name            text,
  is_super_admin  boolean not null default false,   -- MADe180 cross-org access
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index users_email_idx on users (lower(email));

-- A membership grants one user a role within one org. A user may hold several.
create table memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null,   -- 'org_admin' | 'org_staff'
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_idx on memberships (user_id);
create index memberships_org_idx  on memberships (org_id);

-- ---------- 2. receipt_counters: race-safe sequential numbers ----------
-- Allocate the next number atomically inside the gift transaction:
--   insert into receipt_counters (org_id, year, last_value)
--   values ($org, $year, 1)
--   on conflict (org_id, year)
--   do update set last_value = receipt_counters.last_value + 1
--   returning last_value;
-- Then format as e.g. NVRE-2026-000123.
create table receipt_counters (
  org_id     uuid not null references orgs(id) on delete cascade,
  year       integer not null,
  last_value integer not null default 0,
  primary key (org_id, year)
);

-- ---------- 3 & 4. gifts: recurring idempotency + fee/net ----------
alter table gifts add column stripe_invoice_id text;
-- Partial unique: one gift per paid invoice, so invoice.paid replays can't dupe.
create unique index gifts_stripe_invoice_uniq
  on gifts (stripe_invoice_id)
  where stripe_invoice_id is not null;

alter table gifts add column fee_cents integer;   -- Stripe processing fee (from balance txn)
alter table gifts add column net_cents integer;   -- amount_cents - fee_cents

-- ---------- 5. webhook_events: tenancy ----------
-- Nullable: an event is logged before we parse it, and some events may never
-- resolve to a single org.
alter table webhook_events add column org_id uuid references orgs(id) on delete set null;
create index webhook_events_org_idx on webhook_events (org_id);

-- ---------- 6. auto-maintained updated_at ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger constituents_set_updated_at
  before update on constituents
  for each row execute function set_updated_at();

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();
