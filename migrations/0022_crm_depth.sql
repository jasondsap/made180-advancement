-- ============================================================
-- 0022_crm_depth.sql  ·  Phase-5 CRM depth columns.
--
-- 1. gifts.refund_cents — partial refunds. charge.refunded fires for partial
--    refunds too; previously we flipped the WHOLE gift to 'refunded'. Now a
--    partial refund records its amount here and the gift stays 'succeeded'
--    (known trade-off: derived rollups count the gross amount; the gift detail
--    page shows the refund). Full refunds still flip status.
-- 2. constituents.employer — checkout has collected this for matching gifts
--    since day one but only stashed it in Stripe metadata; persist it.
-- ============================================================

alter table gifts add column refund_cents integer;
alter table gifts add constraint gifts_refund_range
  check (refund_cents is null or (refund_cents >= 0 and refund_cents <= amount_cents));

alter table constituents add column employer text;
