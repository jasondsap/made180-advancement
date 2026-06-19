# MADe180 Advancement Platform — Phase 1 Build Spec

**Product:** Multi-tenant nonprofit donor CRM + donation processing
**First tenant:** New Vision Renewable Energy (NVRE) — WV foster-youth housing nonprofit
**Stack:** Next.js (App Router) · Neon PostgreSQL · AWS Cognito · AWS Amplify · Stripe · Anthropic SDK · TypeScript · Recharts · jsPDF
**Author:** Jason / MADe180 Digital Solutions

---

## 0. Build philosophy (read first)

- **No bandaids.** Model relationships properly the first time. Pledges ≠ payments. Soft credits never double-count revenue.
- **Multi-tenant from row zero.** Every table carries `org_id`. Every query is scoped by `org_id`. No exceptions, no retrofits.
- **PCI scope = SAQ-A only.** Card data never touches our server. Stripe Checkout / Payment Element hosts all card entry. We store Stripe IDs and last-four only.
- **Idempotent webhooks.** Stripe can deliver an event more than once. Every webhook write must be safe to replay.
- **AI disclosure (CIO-126 habit):** code authored with AI assistance; do not paste real donor PII into AI sessions during dev. Seed/test data only.

---

## 1. Tenancy model

Single Postgres database, shared schema, `org_id` discriminator on every table.

```
orgs
  id              uuid pk
  slug            text unique         -- 'nvre'
  legal_name      text                -- 'New Vision Renewable Energy'
  ein             text                -- '45-4696610'
  receipt_from_email text
  receipt_signature_name text         -- 'Ruston Seaman, Executive Director'
  stripe_account_id text              -- if Stripe Connect; else null + platform keys
  address_json    jsonb               -- for receipt letterhead
  created_at      timestamptz default now()
```

- App resolves `org_id` from the authenticated Cognito user's org claim (admin app) OR from the donation page route (`/give/[orgSlug]`, public).
- **Enforce isolation in a single data-access layer.** Every repository function takes `orgId` as its first argument. Never trust a client-supplied org id on authenticated routes — derive it from the session.

---

## 2. Database schema (Neon)

Use SQL migrations (numbered, in `/migrations`). Postgres 16. UUID PKs (`gen_random_uuid()`).

### 2.1 constituents (the spine)
```
constituents
  id            uuid pk
  org_id        uuid fk -> orgs
  type          text          -- 'individual' | 'organization'
  first_name    text
  last_name     text
  org_name      text          -- for company/church/foundation donors
  email         text
  phone         text
  address_json  jsonb         -- {line1,line2,city,state,zip,country}
  do_not_contact boolean default false
  source        text          -- 'web_donation' | 'import' | 'manual'
  created_at    timestamptz default now()
  updated_at    timestamptz default now()
  -- dedupe key:
  unique (org_id, lower(email))   -- partial unique where email is not null
```
Flexible attributes go in an EAV side table (reuse the DDOR pattern):
```
constituent_attributes (id, org_id, constituent_id, attr_key, attr_value, created_at)
```

### 2.2 relationships (model early)
```
constituent_relationships
  id, org_id, from_id, to_id,
  rel_type text   -- 'household' | 'spouse' | 'employer' | 'soft_credit_to'
```

### 2.3 funds (restricted/unrestricted buckets — accounting cares)
Seed for NVRE: `village`, `workforce`, `ray_of_life`, `general`.
```
funds (id, org_id, code, name, restricted boolean, active boolean)
```

### 2.4 campaigns / appeals (3-tier attribution)
```
campaigns (id, org_id, name, goal_cents, starts_on, ends_on, active)
appeals   (id, org_id, campaign_id, name, channel)   -- 'web' | 'email' | 'event'
```

### 2.5 gifts (the money)
```
gifts
  id              uuid pk
  org_id          uuid fk
  constituent_id  uuid fk
  fund_id         uuid fk
  campaign_id     uuid fk null
  appeal_id       uuid fk null
  gift_type       text       -- 'one_time' | 'recurring' | 'pledge' | 'in_kind' | 'check'
  amount_cents    integer
  currency        text default 'usd'
  status          text       -- 'succeeded' | 'pending' | 'failed' | 'refunded'
  received_at     timestamptz
  -- Stripe linkage:
  stripe_payment_intent_id text unique null
  stripe_customer_id       text null
  stripe_subscription_id   text null      -- for recurring
  card_last4               text null
  -- tribute / recognition:
  tribute_type    text null   -- 'in_honor' | 'in_memory'
  tribute_name    text null
  soft_credit_id  uuid null   -- another constituent gets recognition, no double revenue
  receipt_sent_at timestamptz null
  receipt_number  text null
  notes           text null
  created_at      timestamptz default now()
```

### 2.6 pledges (promise ≠ payment)
```
pledges (id, org_id, constituent_id, fund_id, campaign_id,
         total_cents, balance_cents, schedule, starts_on, status)
-- gifts.pledge_id nullable fk draws down pledge.balance_cents
```

### 2.7 recurring_plans (mirror of Stripe subscription)
```
recurring_plans (id, org_id, constituent_id, fund_id, stripe_subscription_id,
                 amount_cents, interval, status, started_at, canceled_at)
```

### 2.8 webhook_events (idempotency ledger)
```
webhook_events (id, stripe_event_id text unique, type, payload jsonb,
                processed_at timestamptz, status)
```

---

## 3. Stripe integration

### 3.1 Donation page — public, no auth
Route: `/give/[orgSlug]` (e.g. `/give/nvre`)

NVRE giving options (mirror their existing page):
- **Frequency:** One-time | Monthly (default/recommended — pre-select monthly)
- **Designation (fund):** Where it's needed most (general) · New Vision Village · Workforce Development · Ray of Life Solar
- **Amount:** preset chips ($25 / $50 / $100 / $250 / $1,000) + custom
- **Optional:** tribute (in honor/memory of), employer (for matching), "cover the processing fee" checkbox
- **Donor fields:** name, email, address (address needed for tax receipt)

Implementation:
- One-time → **Stripe Payment Intent** via Payment Element (or Checkout Session, mode=`payment`).
- Monthly → **Stripe Subscription** with a Price created on the fly or metered amount via Checkout Session mode=`subscription`.
- Pass everything we need to reconcile into **Stripe metadata**: `org_id`, `org_slug`, `fund_code`, `frequency`, `tribute_type`, `tribute_name`, `employer`, `constituent_email`, `constituent_name`, `cover_fees`.
- PCI: card entry is Stripe-hosted → SAQ-A. We never see a PAN.

### 3.2 Webhook → auto-log (the magic Lauren asked for)
Route: `POST /api/stripe/webhook` (raw body, verify signature with `STRIPE_WEBHOOK_SECRET`).

Process (all idempotent — check `webhook_events.stripe_event_id` first, insert, then handle):

| Stripe event | Action |
|---|---|
| `checkout.session.completed` / `payment_intent.succeeded` | Upsert constituent by `(org_id, lower(email))`. Insert `gift` (status succeeded). Generate receipt #, send receipt email. |
| `invoice.paid` (recurring) | Find/create constituent, insert recurring gift drawn from subscription metadata. |
| `customer.subscription.created` | Upsert `recurring_plans`. |
| `customer.subscription.deleted` / `updated` | Update plan status. |
| `charge.refunded` | Mark gift `refunded`. |

**Constituent matching:** match on `(org_id, lower(email))`. If found → attach gift. If not → create with `source='web_donation'`. This is the dedupe spine; do NOT create duplicate constituents per gift.

### 3.3 Keys / env
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
DATABASE_URL=            # Neon pooled
DATABASE_URL_UNPOOLED=   # Neon direct, for migrations
COGNITO_*                # standard set
ANTHROPIC_API_KEY=
```

---

## 4. Tax receipts (compliance — get this right)

- Generate on successful gift. **jsPDF** PDF + transactional email.
- Must include: org legal name, **EIN 45-4696610**, donor name + address, gift date, amount, fund, statement: *"No goods or services were provided in exchange for this contribution"* (adjust if quid-pro-quo, e.g. event tickets).
- IRS substantiation: written acknowledgment required for any single gift ≥ $250. Build the language to satisfy it for all gifts so there's no gap.
- Sequential `receipt_number` per org per year (e.g. `NVRE-2026-000123`).
- Year-end consolidated statement is a Phase 2 nicety; per-gift receipt ships in Phase 1.

---

## 5. Admin app (Cognito-protected)

Routes under `/app` (org resolved from session claim):

- **Dashboard** — Recharts: total raised (period selectable), by fund (pie), recurring vs one-time, gifts this month, new vs returning donors, progress vs campaign goal.
- **Gifts** — table, filter by fund/campaign/date/type, gift detail drawer, manual gift entry (for checks/in-kind), mark refund, resend receipt.
- **Constituents** — list, search, detail (gift history, recurring plans, relationships, lifetime value), **merge tool** for dedupe, manual add/edit.
- **Funds / Campaigns / Appeals** — CRUD.
- **Recurring** — active monthly donors, churn view.
- **Settings** — org profile, receipt template fields, fund list, user management.

Roles: `super_admin` (MADe180/cross-org), `org_admin`, `org_staff` (read + gift entry, no settings). Pattern mirrors DDOR/Outcomes.

---

## 6. Build order (ship incrementally)

1. **Migrations + orgs/constituents/funds/gifts tables** + seed NVRE org and 4 funds.
2. **Data-access layer** with `orgId`-scoped repositories + tenancy guard.
3. **Public donation page** `/give/nvre` with Stripe Payment Element (one-time first).
4. **Webhook** → constituent upsert + gift insert + idempotency ledger. Test with Stripe CLI (`stripe listen`, `stripe trigger`).
5. **Receipt** PDF + email on success.
6. **Recurring** (subscriptions + invoice.paid handling).
7. **Admin dashboard + gifts/constituents views.**
8. **Campaigns/appeals, pledges, merge tool.**
9. **Dori-style AI query assistant** (Phase 2): NL → safe parameterized queries over gifts/constituents, scoped to org_id.

---

## 7. Acceptance criteria (Phase 1 done =)

- A real card test on `/give/nvre` (Stripe test mode) creates: 1 constituent, 1 gift (succeeded), 1 emailed PDF receipt with EIN.
- A duplicate gift from the same email attaches to the **same** constituent (no dupe).
- Webhook replay of the same `stripe_event_id` does **not** create a second gift.
- Monthly gift creates a `recurring_plan` and each `invoice.paid` logs a new gift.
- Admin dashboard totals match the sum of `gifts.amount_cents` where status=succeeded, scoped to org.
- Switching to a second seeded org shows zero NVRE data (tenancy proof).

---

## 8. Open items to confirm with Lauren (NVRE)

- Stripe nonprofit rate is 2.2% + $0.30 — confirm she's OK moving web payments off Wix's processor.
- Whether to keep the Wix donate buttons (just relink to `/give/nvre`) or embed the page.
- Existing donor list for CSV import (Phase 2) — what format/system is it in now.
- Receipt signatory + reply-to email.
- Stripe account: new dedicated NVRE account, or platform account w/ Stripe Connect (recommended if you'll onboard the other orgs the same way).
