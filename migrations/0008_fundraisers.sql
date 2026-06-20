-- ============================================================
-- 0008_fundraisers.sql  ·  Fundraisers (publishable giving pages/forms/events).
--
-- A Fundraiser is a public-facing page that COLLECTS gifts and DESIGNATES them
-- to an existing fund (+ optional campaign for reporting). It is distinct from
-- the CRM `campaigns` table (goals/attribution) — they complement each other.
-- raised/supporter totals are DERIVED from gifts.fundraiser_id (no counters).
-- ============================================================

create table fundraisers (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  type             text not null,                 -- 'donation_form' | 'fundraising_page' | 'event'
  title            text not null,
  slug             text not null,
  status           text not null default 'unpublished', -- unpublished|published|ended|archived
  goal_cents       integer,
  currency         text not null default 'usd',
  fund_id          uuid references funds(id) on delete set null,      -- designation
  campaign_id      uuid references campaigns(id) on delete set null,  -- attribution
  features         text[] not null default '{}',  -- 'peer_to_peer' | 'auction'
  payments_enabled boolean not null default true,
  pinned           boolean not null default false,
  theme_json       jsonb,                          -- { accent, coverImageUrl, story, suggestedAmounts }
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index fundraisers_org_slug_uniq on fundraisers (org_id, lower(slug));
create index fundraisers_org_idx on fundraisers (org_id, status);

create trigger fundraisers_set_updated_at
  before update on fundraisers
  for each row execute function set_updated_at();

-- Attribute a gift to the fundraiser that collected it (raised/supporter rollup).
alter table gifts add column fundraiser_id uuid references fundraisers(id) on delete set null;
create index gifts_fundraiser_idx on gifts (fundraiser_id) where fundraiser_id is not null;
