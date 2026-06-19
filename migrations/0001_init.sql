-- ============================================================
-- 0001_init.sql  ·  MADe180 Advancement Platform
-- Multi-tenant nonprofit donor CRM + donations
-- Postgres 16 (Neon).  Run with DATABASE_URL_UNPOOLED.
-- ============================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------- orgs (tenants) ----------
create table orgs (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique,
  legal_name              text not null,
  ein                     text,
  receipt_from_email      text,
  receipt_signature_name  text,
  stripe_account_id       text,                 -- Stripe Connect Express connected account
  address_json            jsonb,
  created_at              timestamptz not null default now()
);

-- ---------- constituents (the spine) ----------
create table constituents (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  type            text not null default 'individual',  -- 'individual' | 'organization'
  first_name      text,
  last_name       text,
  org_name        text,
  email           text,
  phone           text,
  address_json    jsonb,
  do_not_contact  boolean not null default false,
  source          text,                                 -- 'web_donation' | 'import' | 'manual'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- dedupe spine: one email per org (case-insensitive), nulls allowed
create unique index constituents_org_email_uniq
  on constituents (org_id, lower(email))
  where email is not null;

create index constituents_org_idx on constituents (org_id);

-- ---------- flexible attributes (EAV side table) ----------
create table constituent_attributes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  constituent_id uuid not null references constituents(id) on delete cascade,
  attr_key       text not null,
  attr_value     text,
  created_at     timestamptz not null default now()
);
create index constituent_attributes_cid_idx on constituent_attributes (constituent_id);

-- ---------- relationships ----------
create table constituent_relationships (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  from_id   uuid not null references constituents(id) on delete cascade,
  to_id     uuid not null references constituents(id) on delete cascade,
  rel_type  text not null,   -- 'household' | 'spouse' | 'employer' | 'soft_credit_to'
  created_at timestamptz not null default now()
);
create index constituent_rel_org_idx on constituent_relationships (org_id);

-- ---------- funds (restricted / unrestricted buckets) ----------
create table funds (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  code        text not null,
  name        text not null,
  restricted  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, code)
);

-- ---------- campaigns / appeals (3-tier attribution) ----------
create table campaigns (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  name       text not null,
  goal_cents integer,
  starts_on  date,
  ends_on    date,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index campaigns_org_idx on campaigns (org_id);

create table appeals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  name        text not null,
  channel     text,            -- 'web' | 'email' | 'event'
  created_at  timestamptz not null default now()
);
create index appeals_org_idx on appeals (org_id);

-- ---------- pledges (promise ≠ payment) ----------
create table pledges (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  constituent_id  uuid not null references constituents(id) on delete cascade,
  fund_id         uuid references funds(id) on delete set null,
  campaign_id     uuid references campaigns(id) on delete set null,
  total_cents     integer not null,
  balance_cents   integer not null,
  schedule        text,             -- 'monthly' | 'quarterly' | 'annual' | 'custom'
  starts_on       date,
  status          text not null default 'open',  -- 'open' | 'fulfilled' | 'written_off'
  created_at      timestamptz not null default now()
);
create index pledges_org_idx on pledges (org_id);

-- ---------- recurring plans (mirror of Stripe subscription) ----------
create table recurring_plans (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references orgs(id) on delete cascade,
  constituent_id          uuid not null references constituents(id) on delete cascade,
  fund_id                 uuid references funds(id) on delete set null,
  stripe_subscription_id  text unique,
  amount_cents            integer not null,
  interval                text not null default 'month',
  status                  text not null default 'active',  -- 'active' | 'past_due' | 'canceled'
  started_at              timestamptz,
  canceled_at             timestamptz,
  created_at              timestamptz not null default now()
);
create index recurring_plans_org_idx on recurring_plans (org_id);

-- ---------- gifts (the money) ----------
create table gifts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  constituent_id  uuid not null references constituents(id) on delete cascade,
  fund_id         uuid references funds(id) on delete set null,
  campaign_id     uuid references campaigns(id) on delete set null,
  appeal_id       uuid references appeals(id) on delete set null,
  pledge_id       uuid references pledges(id) on delete set null,
  gift_type       text not null,         -- 'one_time'|'recurring'|'pledge'|'in_kind'|'check'
  amount_cents    integer not null,
  currency        text not null default 'usd',
  status          text not null,         -- 'succeeded'|'pending'|'failed'|'refunded'
  received_at     timestamptz,

  stripe_payment_intent_id text unique,
  stripe_customer_id       text,
  stripe_subscription_id   text,
  card_last4               text,

  tribute_type    text,                  -- 'in_honor' | 'in_memory'
  tribute_name    text,
  soft_credit_id  uuid references constituents(id) on delete set null,

  receipt_sent_at timestamptz,
  receipt_number  text,
  notes           text,
  created_at      timestamptz not null default now()
);
create index gifts_org_idx           on gifts (org_id);
create index gifts_constituent_idx   on gifts (constituent_id);
create index gifts_received_idx      on gifts (org_id, received_at);
create unique index gifts_receipt_uniq on gifts (org_id, receipt_number)
  where receipt_number is not null;

-- ---------- webhook idempotency ledger ----------
create table webhook_events (
  id               uuid primary key default gen_random_uuid(),
  stripe_event_id  text not null unique,
  type             text,
  payload          jsonb,
  status           text not null default 'received',  -- 'received'|'processed'|'error'
  processed_at     timestamptz,
  created_at       timestamptz not null default now()
);
