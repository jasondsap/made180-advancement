import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

/**
 * Dashboard analytics — all org-scoped, all over succeeded gifts (the revenue
 * truth). A `since` of null means all-time. Cents come back from bigint as
 * strings, so everything is wrapped with Number().
 */
const n = (v: unknown): number => Number(v ?? 0);
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export interface Totals {
  totalCents: number;
  giftCount: number;
}

export async function periodTotals(orgId: string, since: Date | null): Promise<Totals> {
  assertOrgId(orgId);
  const s = iso(since);
  const rows = (await sql`
    SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total, COUNT(*)::int AS cnt
    FROM gifts
    WHERE org_id = ${orgId} AND status = 'succeeded'
      AND (${s}::timestamptz IS NULL OR received_at >= ${s})
  `) as unknown as Array<{ total: string; cnt: number }>;
  return { totalCents: n(rows[0]?.total), giftCount: n(rows[0]?.cnt) };
}

export interface FundSlice {
  code: string;
  name: string;
  totalCents: number;
  count: number;
}

export async function raisedByFund(orgId: string, since: Date | null): Promise<FundSlice[]> {
  assertOrgId(orgId);
  const s = iso(since);
  const rows = (await sql`
    SELECT f.code, f.name,
           COALESCE(SUM(g.amount_cents), 0)::bigint AS total,
           COUNT(g.id)::int AS cnt
    FROM funds f
    LEFT JOIN gifts g
      ON g.fund_id = f.id AND g.org_id = f.org_id AND g.status = 'succeeded'
      AND (${s}::timestamptz IS NULL OR g.received_at >= ${s})
    WHERE f.org_id = ${orgId}
    GROUP BY f.id, f.code, f.name
    ORDER BY total DESC
  `) as unknown as Array<{ code: string; name: string; total: string; cnt: number }>;
  return rows.map((r) => ({ code: r.code, name: r.name, totalCents: n(r.total), count: n(r.cnt) }));
}

export interface RecurringSplit {
  recurringCents: number;
  oneTimeCents: number;
  otherCents: number;
}

export async function recurringVsOneTime(orgId: string, since: Date | null): Promise<RecurringSplit> {
  assertOrgId(orgId);
  const s = iso(since);
  const rows = (await sql`
    SELECT gift_type, COALESCE(SUM(amount_cents), 0)::bigint AS total
    FROM gifts
    WHERE org_id = ${orgId} AND status = 'succeeded'
      AND (${s}::timestamptz IS NULL OR received_at >= ${s})
    GROUP BY gift_type
  `) as unknown as Array<{ gift_type: string; total: string }>;
  let recurring = 0, oneTime = 0, other = 0;
  for (const r of rows) {
    if (r.gift_type === "recurring") recurring += n(r.total);
    else if (r.gift_type === "one_time") oneTime += n(r.total);
    else other += n(r.total);
  }
  return { recurringCents: recurring, oneTimeCents: oneTime, otherCents: other };
}

export interface DonorSplit {
  newDonors: number;
  returningDonors: number;
}

/**
 * Of the donors who gave in the period, how many are giving for the first time
 * (first-ever succeeded gift falls in the period) vs. returning. Meaningful only
 * with a bounded period; all-time returns every donor as "new".
 */
export async function newVsReturningDonors(orgId: string, since: Date | null): Promise<DonorSplit> {
  assertOrgId(orgId);
  const s = iso(since);
  const rows = (await sql`
    WITH first_gift AS (
      SELECT constituent_id, MIN(received_at) AS first_at
      FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded'
      GROUP BY constituent_id
    ),
    period_donors AS (
      SELECT DISTINCT constituent_id
      FROM gifts
      WHERE org_id = ${orgId} AND status = 'succeeded'
        AND (${s}::timestamptz IS NULL OR received_at >= ${s})
    )
    SELECT
      COUNT(*) FILTER (WHERE ${s}::timestamptz IS NULL OR fg.first_at >= ${s})::int AS new_count,
      COUNT(*) FILTER (WHERE ${s}::timestamptz IS NOT NULL AND fg.first_at < ${s})::int AS returning_count
    FROM period_donors pd
    JOIN first_gift fg ON fg.constituent_id = pd.constituent_id
  `) as unknown as Array<{ new_count: number; returning_count: number }>;
  return { newDonors: n(rows[0]?.new_count), returningDonors: n(rows[0]?.returning_count) };
}

export interface MonthPoint {
  month: string; // 'YYYY-MM'
  totalCents: number;
}

/** Last 12 calendar months of succeeded revenue, gap-filled. */
export async function monthlyTrend(orgId: string): Promise<MonthPoint[]> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT to_char(date_trunc('month', received_at), 'YYYY-MM') AS month,
           COALESCE(SUM(amount_cents), 0)::bigint AS total
    FROM gifts
    WHERE org_id = ${orgId} AND status = 'succeeded'
      AND received_at >= date_trunc('month', now()) - interval '11 months'
    GROUP BY 1
  `) as unknown as Array<{ month: string; total: string }>;
  const map = new Map(rows.map((r) => [r.month, n(r.total)]));

  const out: MonthPoint[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, totalCents: map.get(key) ?? 0 });
  }
  return out;
}

export interface CampaignProgress {
  id: string;
  name: string;
  goalCents: number | null;
  raisedCents: number;
}

export async function campaignProgress(orgId: string): Promise<CampaignProgress[]> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT c.id, c.name, c.goal_cents,
           COALESCE(SUM(g.amount_cents) FILTER (WHERE g.status = 'succeeded'), 0)::bigint AS raised
    FROM campaigns c
    LEFT JOIN gifts g ON g.campaign_id = c.id AND g.org_id = c.org_id
    WHERE c.org_id = ${orgId} AND c.active = true
    GROUP BY c.id, c.name, c.goal_cents
    ORDER BY c.created_at
  `) as unknown as Array<{ id: string; name: string; goal_cents: number | null; raised: string }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    goalCents: r.goal_cents,
    raisedCents: n(r.raised),
  }));
}

export interface TopDonor {
  id: string;
  name: string;
  email: string | null;
  totalCents: number;
  giftCount: number;
}

export async function topDonors(orgId: string, limit = 10): Promise<TopDonor[]> {
  assertOrgId(orgId);
  const lim = Math.min(Math.max(limit, 1), 100);
  const rows = (await sql`
    SELECT c.id,
           COALESCE(NULLIF(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email, 'Unknown') AS name,
           c.email,
           SUM(g.amount_cents)::bigint AS total,
           COUNT(*)::int AS cnt
    FROM gifts g JOIN constituents c ON c.id = g.constituent_id
    WHERE g.org_id = ${orgId} AND g.status = 'succeeded'
    GROUP BY c.id, name, c.email
    ORDER BY total DESC
    LIMIT ${lim}
  `) as unknown as Array<{ id: string; name: string; email: string | null; total: string; cnt: number }>;
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, totalCents: n(r.total), giftCount: n(r.cnt) }));
}

export async function recurringActiveCount(orgId: string): Promise<number> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT COUNT(*)::int AS n FROM recurring_plans WHERE org_id = ${orgId} AND status = 'active'
  `) as unknown as Array<{ n: number }>;
  return n(rows[0]?.n);
}

/**
 * Lifetime total raised per fund. Without an expense/GL ledger (deliberately out
 * of scope) this is "raised to date", not a net balance — labeled as such in UI.
 */
export async function fundTotals(orgId: string): Promise<FundSlice[]> {
  return raisedByFund(orgId, null);
}
