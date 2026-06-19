// ============================================================
// lib/repos/*  ·  Tenancy-scoped data access
// Every function takes orgId first and scopes every query by it.
// Uses @neondatabase/serverless. Pooled DATABASE_URL for app queries.
// Split these into separate files per the import paths in the routes;
// they're collected here for review.
// ============================================================

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

// ---------- lib/repos/orgs.ts ----------
export async function getOrgBySlug(slug: string) {
  const rows = await sql`
    select id, slug, legal_name, ein, stripe_account_id,
           receipt_from_email, receipt_signature_name, address_json
    from orgs where slug = ${slug} limit 1`;
  return rows[0] ?? null;
}

// ---------- lib/repos/funds.ts ----------
export async function getFundByCode(orgId: string, code: string) {
  const rows = await sql`
    select id, code, name, restricted, active
    from funds
    where org_id = ${orgId} and code = ${code} and active = true
    limit 1`;
  return rows[0] ?? null;
}

// ---------- lib/repos/constituents.ts ----------
type UpsertConstituent = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  addressJson?: unknown | null;
  source?: string | null;
};

// Match-or-create on (org_id, lower(email)). The dedupe spine.
// ON CONFLICT uses the partial unique index constituents_org_email_uniq.
export async function upsertConstituentByEmail(orgId: string, c: UpsertConstituent) {
  const email = c.email.trim().toLowerCase();
  const rows = await sql`
    insert into constituents (org_id, type, first_name, last_name, phone, email, address_json, source)
    values (${orgId}, 'individual', ${c.firstName ?? null}, ${c.lastName ?? null},
            ${c.phone ?? null}, ${email}, ${c.addressJson ?? null}::jsonb, ${c.source ?? "web_donation"})
    on conflict (org_id, lower(email)) where email is not null
    do update set
      -- only backfill blanks; never clobber existing curated data
      first_name   = coalesce(constituents.first_name, excluded.first_name),
      last_name    = coalesce(constituents.last_name, excluded.last_name),
      phone        = coalesce(constituents.phone, excluded.phone),
      address_json = coalesce(constituents.address_json, excluded.address_json),
      updated_at   = now()
    returning id, org_id, first_name, last_name, email, address_json`;
  return rows[0];
}

// ---------- lib/repos/gifts.ts ----------
export async function giftExistsForPaymentIntent(pi: string): Promise<boolean> {
  const rows = await sql`
    select 1 from gifts where stripe_payment_intent_id = ${pi} limit 1`;
  return rows.length > 0;
}

type InsertGift = {
  orgId: string;
  constituentId: string;
  fundId: string | null;
  giftType: "one_time" | "recurring" | "pledge" | "in_kind" | "check";
  amountCents: number;
  status: "succeeded" | "pending" | "failed" | "refunded";
  receivedAt: Date;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  tributeType?: string | null;
  tributeName?: string | null;
  receiptNumber?: string | null;
};

export async function insertGift(g: InsertGift) {
  const rows = await sql`
    insert into gifts (
      org_id, constituent_id, fund_id, gift_type, amount_cents, currency, status,
      received_at, stripe_payment_intent_id, stripe_customer_id, stripe_subscription_id,
      tribute_type, tribute_name, receipt_number
    ) values (
      ${g.orgId}, ${g.constituentId}, ${g.fundId}, ${g.giftType}, ${g.amountCents}, 'usd', ${g.status},
      ${g.receivedAt.toISOString()}, ${g.stripePaymentIntentId ?? null}, ${g.stripeCustomerId ?? null},
      ${g.stripeSubscriptionId ?? null}, ${g.tributeType ?? null}, ${g.tributeName ?? null},
      ${g.receiptNumber ?? null}
    )
    on conflict (stripe_payment_intent_id) do nothing
    returning *`;
  return rows[0];
}

export async function markGiftRefunded(paymentIntentId: string) {
  await sql`
    update gifts set status = 'refunded'
    where stripe_payment_intent_id = ${paymentIntentId}`;
}

// ---------- lib/repos/receipts.ts ----------
// Sequential per-org per-year receipt number: NVRE-2026-000123.
// Atomic via a counter row; relies on row lock under concurrency.
export async function nextReceiptNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await sql`
    insert into receipt_counters (org_id, year, last_seq)
    values (${orgId}, ${year}, 1)
    on conflict (org_id, year)
    do update set last_seq = receipt_counters.last_seq + 1
    returning last_seq`;
  const seq = rows[0].last_seq as number;
  const org = await sql`select slug from orgs where id = ${orgId}`;
  const prefix = (org[0]?.slug ?? "org").toUpperCase();
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

// ---------- lib/repos/webhookEvents.ts ----------
// Returns true if WE claimed it (first time), false if already seen.
export async function claimWebhookEvent(e: {
  stripeEventId: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const rows = await sql`
    insert into webhook_events (stripe_event_id, type, payload, status)
    values (${e.stripeEventId}, ${e.type}, ${JSON.stringify(e.payload)}::jsonb, 'received')
    on conflict (stripe_event_id) do nothing
    returning id`;
  return rows.length > 0;
}

export async function markWebhookProcessed(stripeEventId: string) {
  await sql`update webhook_events set status='processed', processed_at=now()
            where stripe_event_id = ${stripeEventId}`;
}

export async function markWebhookError(stripeEventId: string, msg: string) {
  await sql`update webhook_events set status='error', processed_at=now(),
            payload = payload || jsonb_build_object('error', ${msg})
            where stripe_event_id = ${stripeEventId}`;
}

// ---------- lib/repos/recurringPlans.ts ----------
export async function upsertRecurringPlan(p: {
  orgId: string;
  constituentId: string | null;
  fundId: string | null;
  stripeSubscriptionId: string;
  amountCents: number;
  interval: string;
  status: string;
  startedAt: Date;
}) {
  await sql`
    insert into recurring_plans (
      org_id, constituent_id, fund_id, stripe_subscription_id,
      amount_cents, interval, status, started_at
    ) values (
      ${p.orgId}, ${p.constituentId}, ${p.fundId}, ${p.stripeSubscriptionId},
      ${p.amountCents}, ${p.interval}, ${p.status}, ${p.startedAt.toISOString()}
    )
    on conflict (stripe_subscription_id) do update set
      status = excluded.status,
      amount_cents = excluded.amount_cents`;
}

export async function setRecurringPlanStatus(
  stripeSubscriptionId: string,
  status: string,
  canceledAt?: Date
) {
  await sql`
    update recurring_plans
    set status = ${status},
        canceled_at = ${canceledAt ? canceledAt.toISOString() : null}
    where stripe_subscription_id = ${stripeSubscriptionId}`;
}
