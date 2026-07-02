-- ============================================================
-- 0013_campaigns.sql  ·  Campaigns module: detail dashboard, appeals
-- performance, public campaign pages, anonymous giving.
--
-- - campaigns grow presentation fields + a public slug (a campaign page only
--   exists when public_slug is set and active = true — per-campaign opt-in).
-- - appeals grow ask_amount_cents + sent_on for per-appeal performance.
-- - gifts.is_anonymous: donor-requested display anonymity (donor walls, top-
--   donor lists). Display-level only — receipts/CRM still identify the donor.
-- - engage_messages.appeal_id links a Tidings blast to the appeal it promotes,
--   closing the loop segment -> AI draft -> send -> attributed gifts.
-- - Attribution indexes: campaign/appeal rollups were seq-scanning gifts.
-- ============================================================

alter table campaigns add column description     text;
alter table campaigns add column category        text;   -- 'annual' | 'capital' | 'event' | 'giving_day' | 'memorial'
alter table campaigns add column cover_image_url text;
alter table campaigns add column public_slug     text;

create unique index campaigns_org_public_slug_uniq
  on campaigns (org_id, lower(public_slug))
  where public_slug is not null;

alter table appeals add column ask_amount_cents integer;
alter table appeals add column sent_on          date;

alter table gifts add column is_anonymous boolean not null default false;

create index gifts_campaign_idx on gifts (org_id, campaign_id)
  where campaign_id is not null;
create index gifts_appeal_idx on gifts (org_id, appeal_id)
  where appeal_id is not null;

alter table engage_messages add column appeal_id uuid references appeals(id) on delete set null;
create index engage_messages_appeal_idx on engage_messages (appeal_id)
  where appeal_id is not null;
