-- ============================================================
-- 0005_gift_benefit.sql  ·  Quid-pro-quo support.
-- When a donor receives goods/services (e.g. an event ticket), only the amount
-- above fair-market value is deductible. Store the FMV + a description so the
-- receipt can state the deductible portion.
-- ============================================================

alter table gifts add column benefit_fmv_cents integer;     -- FMV of goods/services received
alter table gifts add column benefit_description text;       -- e.g. "Gala dinner + concert"
