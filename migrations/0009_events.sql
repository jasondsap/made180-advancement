-- ============================================================
-- 0009_events.sql  ·  Event fundraisers: ticket types + registrants.
--
-- An event is a fundraiser (type='event'). Ticket types belong to it; a
-- registrant is one paid line (a ticket type x quantity) tied to a Stripe
-- checkout. Tickets sold are DERIVED from confirmed registrants (no counter).
-- Ticket purchases still record a gift (attributed to the fundraiser) so
-- raised/supporter rollups work — receipts are intentionally not auto-issued
-- (tickets carry fair-market value; deductibility handled separately later).
-- ============================================================

create table ticket_types (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  fundraiser_id uuid not null references fundraisers(id) on delete cascade,
  name          text not null,
  description   text,
  price_cents   integer not null default 0,
  capacity      integer,                       -- null = unlimited
  active        boolean not null default true,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);
create index ticket_types_fundraiser_idx on ticket_types (fundraiser_id);

create table registrants (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references orgs(id) on delete cascade,
  fundraiser_id            uuid not null references fundraisers(id) on delete cascade,
  ticket_type_id           uuid references ticket_types(id) on delete set null,
  constituent_id           uuid references constituents(id) on delete set null,
  name                     text,
  email                    text,
  quantity                 integer not null default 1,
  amount_cents             integer not null default 0,
  status                   text not null default 'confirmed', -- confirmed|canceled
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at               timestamptz not null default now()
);
create index registrants_fundraiser_idx on registrants (fundraiser_id);
create index registrants_org_idx on registrants (org_id);
-- Idempotency: one row per (session, ticket type) so a webhook replay can't dupe.
create unique index registrants_session_ticket_uniq
  on registrants (stripe_checkout_session_id, ticket_type_id)
  where stripe_checkout_session_id is not null;
