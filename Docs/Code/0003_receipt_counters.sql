-- ============================================================
-- 0003_receipt_counters.sql
-- Atomic per-org, per-year sequence for receipt numbers.
-- Avoids gaps/races from counting existing rows.
-- ============================================================

create table receipt_counters (
  org_id    uuid not null references orgs(id) on delete cascade,
  year      integer not null,
  last_seq  integer not null default 0,
  primary key (org_id, year)
);
