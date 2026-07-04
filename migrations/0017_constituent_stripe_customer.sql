-- ============================================================
-- 0017_constituent_stripe_customer.sql  ·  Persist the donor's Stripe customer.
--
-- Repeat donors previously got a fresh Stripe Customer per checkout (we passed
-- customer_email), fragmenting their subscriptions and blocking a donor-facing
-- billing portal. We now capture the customer id onto the constituent (webhook)
-- and reuse it on the next checkout, so a donor has ONE customer and can manage
-- every recurring gift from a single Stripe Billing Portal session.
-- ============================================================

alter table constituents add column stripe_customer_id text;
create index constituents_stripe_customer_idx
  on constituents (stripe_customer_id) where stripe_customer_id is not null;
