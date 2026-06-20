import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Gift, InsertGiftInput } from "@/types/db";

/**
 * Gift repository — the money. Every query scoped to org_id.
 *
 * Idempotency: the unique constraints on stripe_payment_intent_id and the
 * partial unique index on stripe_invoice_id are the natural keys the webhook
 * uses (alongside the webhook_events ledger) so a replayed Stripe event can't
 * create a duplicate gift. insertGift uses ON CONFLICT DO NOTHING on those keys
 * and returns the existing row if present.
 */

export async function insertGift(
  orgId: string,
  input: InsertGiftInput,
): Promise<{ gift: Gift; created: boolean }> {
  assertOrgId(orgId);

  const rows = (await sql`
    INSERT INTO gifts (
      org_id, constituent_id, fund_id, campaign_id, appeal_id, pledge_id, fundraiser_id, p2p_member_id,
      gift_type, amount_cents, currency, status, received_at,
      stripe_payment_intent_id, stripe_customer_id, stripe_subscription_id,
      stripe_invoice_id, card_last4,
      tribute_type, tribute_name, soft_credit_id,
      fee_cents, net_cents, benefit_fmv_cents, benefit_description, notes
    ) VALUES (
      ${orgId},
      ${input.constituentId},
      ${input.fundId ?? null},
      ${input.campaignId ?? null},
      ${input.appealId ?? null},
      ${input.pledgeId ?? null},
      ${input.fundraiserId ?? null},
      ${input.p2pMemberId ?? null},
      ${input.giftType},
      ${input.amountCents},
      ${input.currency ?? "usd"},
      ${input.status},
      ${input.receivedAt ?? null},
      ${input.stripePaymentIntentId ?? null},
      ${input.stripeCustomerId ?? null},
      ${input.stripeSubscriptionId ?? null},
      ${input.stripeInvoiceId ?? null},
      ${input.cardLast4 ?? null},
      ${input.tributeType ?? null},
      ${input.tributeName ?? null},
      ${input.softCreditId ?? null},
      ${input.feeCents ?? null},
      ${input.netCents ?? null},
      ${input.benefitFmvCents ?? null},
      ${input.benefitDescription ?? null},
      ${input.notes ?? null}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `) as unknown as Gift[];

  const inserted = rows[0];
  if (inserted) return { gift: inserted, created: true };

  // Conflict on a Stripe natural key — the gift already exists. Return it so the
  // webhook can proceed idempotently.
  const existing = await findExistingByStripeKeys(orgId, input);
  if (!existing) {
    throw new Error(
      "insertGift hit ON CONFLICT but could not locate the existing gift; " +
        "check the Stripe id inputs.",
    );
  }
  return { gift: existing, created: false };
}

async function findExistingByStripeKeys(
  orgId: string,
  input: InsertGiftInput,
): Promise<Gift | undefined> {
  if (input.stripePaymentIntentId) {
    const g = await getByStripePaymentIntentId(orgId, input.stripePaymentIntentId);
    if (g) return g;
  }
  if (input.stripeInvoiceId) {
    const g = await getByStripeInvoiceId(orgId, input.stripeInvoiceId);
    if (g) return g;
  }
  return undefined;
}

export async function getGiftById(
  orgId: string,
  id: string,
): Promise<Gift | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM gifts WHERE org_id = ${orgId} AND id = ${id} LIMIT 1
  `) as unknown as Gift[];
  return rows[0];
}

export async function getByStripePaymentIntentId(
  orgId: string,
  paymentIntentId: string,
): Promise<Gift | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM gifts
    WHERE org_id = ${orgId} AND stripe_payment_intent_id = ${paymentIntentId}
    LIMIT 1
  `) as unknown as Gift[];
  return rows[0];
}

export async function getByStripeInvoiceId(
  orgId: string,
  invoiceId: string,
): Promise<Gift | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM gifts
    WHERE org_id = ${orgId} AND stripe_invoice_id = ${invoiceId}
    LIMIT 1
  `) as unknown as Gift[];
  return rows[0];
}

export async function listGifts(
  orgId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<Gift[]> {
  assertOrgId(orgId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  return (await sql`
    SELECT * FROM gifts
    WHERE org_id = ${orgId}
    ORDER BY received_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as Gift[];
}

export interface GiftFilters {
  fundId?: string | null;
  giftType?: string | null;
  status?: string | null;
  dateFrom?: string | null; // 'YYYY-MM-DD'
  dateTo?: string | null; // 'YYYY-MM-DD' (inclusive)
  search?: string | null;
  limit?: number;
  offset?: number;
}

export interface GiftListRow extends Gift {
  donor_first: string | null;
  donor_last: string | null;
  donor_org: string | null;
  donor_email: string | null;
  fund_code: string | null;
  fund_name: string | null;
}

function searchLike(s: string | null | undefined): string | null {
  const t = s?.trim().toLowerCase();
  return t ? `%${t}%` : null;
}

export async function listGiftsFiltered(orgId: string, f: GiftFilters): Promise<GiftListRow[]> {
  assertOrgId(orgId);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);
  const like = searchLike(f.search);
  return (await sql`
    SELECT g.*,
           c.first_name AS donor_first, c.last_name AS donor_last,
           c.org_name AS donor_org, c.email AS donor_email,
           f.code AS fund_code, f.name AS fund_name
    FROM gifts g
    JOIN constituents c ON c.id = g.constituent_id
    LEFT JOIN funds f ON f.id = g.fund_id
    WHERE g.org_id = ${orgId}
      AND (${f.fundId ?? null}::uuid IS NULL OR g.fund_id = ${f.fundId ?? null})
      AND (${f.giftType ?? null}::text IS NULL OR g.gift_type = ${f.giftType ?? null})
      AND (${f.status ?? null}::text IS NULL OR g.status = ${f.status ?? null})
      AND (${f.dateFrom ?? null}::date IS NULL OR g.received_at >= ${f.dateFrom ?? null}::date)
      AND (${f.dateTo ?? null}::date IS NULL OR g.received_at < (${f.dateTo ?? null}::date + 1))
      AND (${like}::text IS NULL OR (
            lower(c.email) LIKE ${like}
            OR lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) LIKE ${like}
            OR lower(coalesce(c.org_name,'')) LIKE ${like}))
    ORDER BY g.received_at DESC NULLS LAST, g.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as GiftListRow[];
}

/** Unpaginated export query (date asc) for accounting exports. */
export async function exportGifts(
  orgId: string,
  f: Pick<GiftFilters, "fundId" | "status" | "dateFrom" | "dateTo">,
): Promise<GiftListRow[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT g.*,
           c.first_name AS donor_first, c.last_name AS donor_last,
           c.org_name AS donor_org, c.email AS donor_email,
           f.code AS fund_code, f.name AS fund_name
    FROM gifts g
    JOIN constituents c ON c.id = g.constituent_id
    LEFT JOIN funds f ON f.id = g.fund_id
    WHERE g.org_id = ${orgId}
      AND (${f.fundId ?? null}::uuid IS NULL OR g.fund_id = ${f.fundId ?? null})
      AND (${f.status ?? null}::text IS NULL OR g.status = ${f.status ?? null})
      AND (${f.dateFrom ?? null}::date IS NULL OR g.received_at >= ${f.dateFrom ?? null}::date)
      AND (${f.dateTo ?? null}::date IS NULL OR g.received_at < (${f.dateTo ?? null}::date + 1))
    ORDER BY g.received_at ASC NULLS LAST, g.created_at ASC
  `) as unknown as GiftListRow[];
}

export async function countGiftsFiltered(orgId: string, f: GiftFilters): Promise<number> {
  assertOrgId(orgId);
  const like = searchLike(f.search);
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM gifts g
    JOIN constituents c ON c.id = g.constituent_id
    WHERE g.org_id = ${orgId}
      AND (${f.fundId ?? null}::uuid IS NULL OR g.fund_id = ${f.fundId ?? null})
      AND (${f.giftType ?? null}::text IS NULL OR g.gift_type = ${f.giftType ?? null})
      AND (${f.status ?? null}::text IS NULL OR g.status = ${f.status ?? null})
      AND (${f.dateFrom ?? null}::date IS NULL OR g.received_at >= ${f.dateFrom ?? null}::date)
      AND (${f.dateTo ?? null}::date IS NULL OR g.received_at < (${f.dateTo ?? null}::date + 1))
      AND (${like}::text IS NULL OR (
            lower(c.email) LIKE ${like}
            OR lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) LIKE ${like}
            OR lower(coalesce(c.org_name,'')) LIKE ${like}))
  `) as unknown as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

/** Mark a gift refunded, org-scoped (admin action). Returns the updated gift. */
export async function markRefunded(orgId: string, giftId: string): Promise<Gift | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    UPDATE gifts SET status = 'refunded'
    WHERE org_id = ${orgId} AND id = ${giftId}
    RETURNING *
  `) as unknown as Gift[];
  return rows[0];
}

/**
 * Mark a gift refunded by its Stripe PaymentIntent id. NOT org-first: the PI id
 * is globally unique and Stripe-trusted, and charge.refunded events don't carry
 * our org metadata — like the webhook ledger, a documented tenancy exception.
 * Returns the updated gift (whose org_id can then backfill the event row).
 */
export async function markRefundedByPaymentIntent(
  paymentIntentId: string,
): Promise<Gift | undefined> {
  const rows = (await sql`
    UPDATE gifts SET status = 'refunded'
    WHERE stripe_payment_intent_id = ${paymentIntentId}
    RETURNING *
  `) as unknown as Gift[];
  return rows[0];
}

export async function listGiftsForConstituent(orgId: string, constituentId: string): Promise<Gift[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM gifts
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId}
    ORDER BY received_at DESC NULLS LAST, created_at DESC
  `) as unknown as Gift[];
}

export interface ConstituentLtv {
  totalCents: number;
  giftCount: number;
  firstGiftAt: Date | null;
  lastGiftAt: Date | null;
}

/** Lifetime value: succeeded gifts only. */
export async function constituentLtv(orgId: string, constituentId: string): Promise<ConstituentLtv> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total,
           COUNT(*)::int AS cnt,
           MIN(received_at) AS first_at,
           MAX(received_at) AS last_at
    FROM gifts
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId} AND status = 'succeeded'
  `) as unknown as Array<{ total: string; cnt: number; first_at: Date | null; last_at: Date | null }>;
  const r = rows[0];
  return {
    totalCents: Number(r?.total ?? 0),
    giftCount: Number(r?.cnt ?? 0),
    firstGiftAt: r?.first_at ?? null,
    lastGiftAt: r?.last_at ?? null,
  };
}

/** Sum of succeeded gift amounts (cents) for the org — the dashboard's anchor. */
export async function sumSucceededCents(orgId: string): Promise<number> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total
    FROM gifts
    WHERE org_id = ${orgId} AND status = 'succeeded'
  `) as unknown as Array<{ total: string | number }>;
  return Number(rows[0]?.total ?? 0);
}
