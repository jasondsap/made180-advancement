-- ============================================================
-- 0010_p2p_auction.sql  ·  Peer-to-peer fundraisers + auctions.
--
-- Both are opt-in features on a fundraiser (fundraisers.features). A p2p_member
-- is a supporter raising money toward a parent fundraiser; gifts attribute to
-- them via gifts.p2p_member_id and roll up to the fundraiser. Auctions hold
-- items that receive bids; the high bid leads. Bid settlement (collecting the
-- winner's payment) is handled outside the app for v1.
-- ============================================================

create table p2p_members (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  fundraiser_id  uuid not null references fundraisers(id) on delete cascade,
  constituent_id uuid references constituents(id) on delete set null,
  name           text not null,
  slug           text not null,
  goal_cents     integer,
  message        text,
  created_at     timestamptz not null default now()
);
create unique index p2p_members_fundraiser_slug_uniq on p2p_members (fundraiser_id, lower(slug));
create index p2p_members_org_idx on p2p_members (org_id);

alter table gifts add column p2p_member_id uuid references p2p_members(id) on delete set null;
create index gifts_p2p_member_idx on gifts (p2p_member_id) where p2p_member_id is not null;

create table auction_items (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references orgs(id) on delete cascade,
  fundraiser_id         uuid not null references fundraisers(id) on delete cascade,
  name                  text not null,
  description           text,
  image_url             text,
  fair_market_value_cents integer,
  starting_bid_cents    integer not null default 0,
  min_increment_cents   integer not null default 100,
  status                text not null default 'open',  -- open | closed
  created_at            timestamptz not null default now()
);
create index auction_items_fundraiser_idx on auction_items (fundraiser_id);

create table auction_bids (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  auction_item_id uuid not null references auction_items(id) on delete cascade,
  fundraiser_id   uuid not null references fundraisers(id) on delete cascade,
  constituent_id  uuid references constituents(id) on delete set null,
  name            text,
  email           text,
  amount_cents    integer not null,
  created_at      timestamptz not null default now()
);
create index auction_bids_item_idx on auction_bids (auction_item_id, amount_cents desc);
