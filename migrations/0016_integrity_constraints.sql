-- ============================================================
-- 0016_integrity_constraints.sql  ·  Financial-integrity guardrails.
--
-- Three things the schema was missing (audit 2026-07):
--   1. Deleting a constituent CASCADE-wiped their financial history. Gifts,
--      pledges, and recurring plans are records-of-record — switch those FKs to
--      ON DELETE RESTRICT so a donor with money on file can't be deleted out
--      from under it. (The merge flow reassigns these first, so it still works.)
--   2. No CHECK constraints anywhere — money could go negative at the DB level.
--   3. Missing indexes on hot filter/join columns (fund rollups, pledge lookups,
--      donor-profile plan lists, webhook reconciliation).
--
-- The FK swaps target the constituent_id FK specifically (gifts also has a
-- soft_credit_id FK to constituents, which must keep ON DELETE SET NULL).
-- ============================================================

-- ---------- 1. FK ON DELETE: CASCADE -> RESTRICT for financial history ----------
do $$
declare cname text;
begin
  select con.conname into cname
  from pg_constraint con
  where con.conrelid = 'gifts'::regclass and con.contype = 'f'
    and con.confrelid = 'constituents'::regclass
    and (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) = 'constituent_id'
  limit 1;
  if cname is not null then execute format('alter table gifts drop constraint %I', cname); end if;
end $$;
alter table gifts add constraint gifts_constituent_id_fkey
  foreign key (constituent_id) references constituents(id) on delete restrict;

do $$
declare cname text;
begin
  select con.conname into cname
  from pg_constraint con
  where con.conrelid = 'pledges'::regclass and con.contype = 'f'
    and con.confrelid = 'constituents'::regclass
    and (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) = 'constituent_id'
  limit 1;
  if cname is not null then execute format('alter table pledges drop constraint %I', cname); end if;
end $$;
alter table pledges add constraint pledges_constituent_id_fkey
  foreign key (constituent_id) references constituents(id) on delete restrict;

do $$
declare cname text;
begin
  select con.conname into cname
  from pg_constraint con
  where con.conrelid = 'recurring_plans'::regclass and con.contype = 'f'
    and con.confrelid = 'constituents'::regclass
    and (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) = 'constituent_id'
  limit 1;
  if cname is not null then execute format('alter table recurring_plans drop constraint %I', cname); end if;
end $$;
alter table recurring_plans add constraint recurring_plans_constituent_id_fkey
  foreign key (constituent_id) references constituents(id) on delete restrict;

-- ---------- 2. CHECK constraints: money is non-negative ----------
-- All amounts are integer cents and are never legitimately negative (refunds are
-- a status change, not a sign flip), so these cannot fail on existing rows.
alter table gifts           add constraint gifts_amount_nonneg        check (amount_cents >= 0);
alter table pledges         add constraint pledges_total_nonneg       check (total_cents >= 0);
alter table pledges         add constraint pledges_balance_range      check (balance_cents >= 0 and balance_cents <= total_cents);
alter table recurring_plans add constraint recurring_amount_nonneg    check (amount_cents >= 0);
alter table ticket_types    add constraint ticket_price_nonneg        check (price_cents >= 0);
alter table auction_items   add constraint auction_start_nonneg       check (starting_bid_cents >= 0 and min_increment_cents >= 0);
alter table auction_bids    add constraint auction_bid_nonneg         check (amount_cents >= 0);
alter table campaigns       add constraint campaigns_goal_nonneg      check (goal_cents is null or goal_cents >= 0);

-- ---------- 3. Missing indexes on hot paths ----------
create index if not exists gifts_fund_idx            on gifts (org_id, fund_id) where fund_id is not null;
create index if not exists gifts_pledge_idx          on gifts (pledge_id) where pledge_id is not null;
create index if not exists gifts_stripe_customer_idx on gifts (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists gifts_stripe_sub_idx      on gifts (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists pledges_constituent_idx   on pledges (org_id, constituent_id);
create index if not exists recurring_constituent_idx on recurring_plans (org_id, constituent_id);
create index if not exists registrants_ticket_type_idx on registrants (ticket_type_id) where ticket_type_id is not null;
