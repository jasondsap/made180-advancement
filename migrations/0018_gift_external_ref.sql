-- ============================================================
-- 0018_gift_external_ref.sql  ·  Idempotent gift import.
--
-- external_ref carries the source system's gift id (e.g. LGL's Gift ID column)
-- during a CSV import. The partial unique index makes re-running the same
-- import a no-op instead of doubling every historical gift.
-- ============================================================

alter table gifts add column external_ref text;
create unique index gifts_org_external_ref_uniq
  on gifts (org_id, external_ref) where external_ref is not null;
