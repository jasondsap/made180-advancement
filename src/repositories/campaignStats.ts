import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import { isoDay } from "@/lib/format";
import type { Campaign } from "@/repositories/campaigns";

/**
 * Campaign detail aggregations — feed the campaign dashboard, the public
 * campaign page, and the board report. All org-scoped, all over succeeded
 * gifts; cents come back from bigint as strings, so wrapped with Number().
 */
const n = (v: unknown): number => Number(v ?? 0);

export interface CampaignSummary {
  raisedCents: number;
  giftCount: number;
  donorCount: number;
  avgGiftCents: number;
  recurringCents: number;
  oneTimeCents: number;
  otherCents: number;
  /** "New" = the donor's first-ever succeeded gift was to THIS campaign. */
  newDonors: number;
  returningDonors: number;
}

export async function campaignSummary(orgId: string, campaignId: string): Promise<CampaignSummary> {
  assertOrgId(orgId);
  const rows = (await sql`
    WITH cg AS (
      SELECT constituent_id, amount_cents, gift_type
      FROM gifts
      WHERE org_id = ${orgId} AND campaign_id = ${campaignId} AND status = 'succeeded'
    ),
    first_gift AS (
      SELECT DISTINCT ON (constituent_id) constituent_id, campaign_id AS first_campaign
      FROM gifts
      WHERE org_id = ${orgId} AND status = 'succeeded'
      ORDER BY constituent_id, received_at ASC NULLS LAST, created_at ASC
    ),
    donor_flags AS (
      SELECT d.constituent_id, (fg.first_campaign = ${campaignId}) AS is_new
      FROM (SELECT DISTINCT constituent_id FROM cg) d
      JOIN first_gift fg USING (constituent_id)
    )
    SELECT
      (SELECT COALESCE(SUM(amount_cents), 0) FROM cg)::bigint AS raised,
      (SELECT COUNT(*) FROM cg)::int AS gift_count,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM cg WHERE gift_type = 'recurring')::bigint AS recurring,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM cg WHERE gift_type = 'one_time')::bigint AS one_time,
      (SELECT COUNT(*) FROM donor_flags)::int AS donor_count,
      (SELECT COUNT(*) FROM donor_flags WHERE is_new)::int AS new_donors
  `) as unknown as Array<{
    raised: string; gift_count: number; recurring: string; one_time: string;
    donor_count: number; new_donors: number;
  }>;
  const r = rows[0];
  const raised = n(r?.raised);
  const giftCount = n(r?.gift_count);
  const donorCount = n(r?.donor_count);
  const newDonors = n(r?.new_donors);
  return {
    raisedCents: raised,
    giftCount,
    donorCount,
    avgGiftCents: giftCount ? Math.round(raised / giftCount) : 0,
    recurringCents: n(r?.recurring),
    oneTimeCents: n(r?.one_time),
    otherCents: raised - n(r?.recurring) - n(r?.one_time),
    newDonors,
    returningDonors: donorCount - newDonors,
  };
}

/**
 * Revenue by source. Auction settlement is offline in v1 (bids never become
 * gifts), so there is deliberately no "auction" slice — it would always be $0.
 */
export type CampaignSource = "direct" | "event" | "p2p" | "fundraiser";

export const CAMPAIGN_SOURCE_LABELS: Record<CampaignSource, string> = {
  direct: "Direct gifts",
  event: "Event tickets",
  p2p: "Peer-to-peer",
  fundraiser: "Fundraiser pages",
};

export interface SourceSlice {
  source: CampaignSource;
  totalCents: number;
  count: number;
}

export async function campaignSourceBreakdown(orgId: string, campaignId: string): Promise<SourceSlice[]> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT CASE
             WHEN g.fundraiser_id IS NULL THEN 'direct'
             WHEN g.p2p_member_id IS NOT NULL THEN 'p2p'
             WHEN fr.type = 'event' THEN 'event'
             ELSE 'fundraiser'
           END AS source,
           COALESCE(SUM(g.amount_cents), 0)::bigint AS total,
           COUNT(*)::int AS cnt
    FROM gifts g
    LEFT JOIN fundraisers fr ON fr.id = g.fundraiser_id AND fr.org_id = g.org_id
    WHERE g.org_id = ${orgId} AND g.campaign_id = ${campaignId} AND g.status = 'succeeded'
    GROUP BY 1
    ORDER BY total DESC
  `) as unknown as Array<{ source: CampaignSource; total: string; cnt: number }>;
  return rows.map((r) => ({ source: r.source, totalCents: n(r.total), count: n(r.cnt) }));
}

export interface CampaignRaisedRow {
  campaignId: string;
  raisedCents: number;
  donorCount: number;
  giftCount: number;
}

/** Raised/donor/gift totals for every campaign (active or not) in one query — the list page. */
export async function campaignRaisedTotals(orgId: string): Promise<CampaignRaisedRow[]> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT c.id,
           COALESCE(SUM(g.amount_cents) FILTER (WHERE g.status = 'succeeded'), 0)::bigint AS raised,
           COUNT(DISTINCT g.constituent_id) FILTER (WHERE g.status = 'succeeded')::int AS donors,
           COUNT(g.id) FILTER (WHERE g.status = 'succeeded')::int AS gifts
    FROM campaigns c
    LEFT JOIN gifts g ON g.campaign_id = c.id AND g.org_id = c.org_id
    WHERE c.org_id = ${orgId}
    GROUP BY c.id
  `) as unknown as Array<{ id: string; raised: string; donors: number; gifts: number }>;
  return rows.map((r) => ({
    campaignId: r.id,
    raisedCents: n(r.raised),
    donorCount: n(r.donors),
    giftCount: n(r.gifts),
  }));
}

export interface CumulativePoint {
  day: string; // 'YYYY-MM-DD'
  cumulativeCents: number;
}

/**
 * Cumulative raised over the campaign window, gap-filled daily from
 * min(starts_on, first gift) to min(today, ends_on).
 */
export async function campaignCumulative(orgId: string, campaign: Campaign): Promise<CumulativePoint[]> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT to_char(received_at::date, 'YYYY-MM-DD') AS day,
           COALESCE(SUM(amount_cents), 0)::bigint AS total
    FROM gifts
    WHERE org_id = ${orgId} AND campaign_id = ${campaign.id} AND status = 'succeeded'
      AND received_at IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `) as unknown as Array<{ day: string; total: string }>;

  const byDay = new Map(rows.map((r) => [r.day, n(r.total)]));
  const todayKey = new Date().toISOString().slice(0, 10);
  const firstGiftDay = rows[0]?.day ?? null;

  const startKey = isoDay(campaign.starts_on) ?? firstGiftDay;
  if (!startKey) return [];
  const rawEnd = isoDay(campaign.ends_on) ?? todayKey;
  const endKey = rawEnd < todayKey ? rawEnd : todayKey;
  // Include gifts recorded before starts_on (attributed early) in the opening balance.
  const lower = firstGiftDay && firstGiftDay < startKey ? firstGiftDay : startKey;

  const out: CumulativePoint[] = [];
  let running = 0;
  const cursor = new Date(`${lower}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    running += byDay.get(key) ?? 0;
    if (key >= startKey) out.push({ day: key, cumulativeCents: running });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  // A pre-start opening balance with no in-window points still deserves a point.
  if (out.length === 0 && running > 0) out.push({ day: startKey, cumulativeCents: running });
  return out;
}

export interface AppealPerformance {
  id: string;
  name: string;
  channel: string | null;
  ask_amount_cents: number | null;
  sent_on: string | Date | null;
  raisedCents: number;
  giftCount: number;
  avgGiftCents: number;
}

export async function appealPerformance(orgId: string, campaignId: string): Promise<AppealPerformance[]> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT a.id, a.name, a.channel, a.ask_amount_cents, a.sent_on,
           COALESCE(SUM(g.amount_cents) FILTER (WHERE g.status = 'succeeded'), 0)::bigint AS raised,
           COUNT(g.id) FILTER (WHERE g.status = 'succeeded')::int AS cnt
    FROM appeals a
    LEFT JOIN gifts g ON g.appeal_id = a.id AND g.org_id = a.org_id
    WHERE a.org_id = ${orgId} AND a.campaign_id = ${campaignId}
    GROUP BY a.id, a.name, a.channel, a.ask_amount_cents, a.sent_on
    ORDER BY raised DESC, MAX(a.created_at) DESC
  `) as unknown as Array<{
    id: string; name: string; channel: string | null; ask_amount_cents: number | null;
    sent_on: string | null; raised: string; cnt: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    channel: r.channel,
    ask_amount_cents: r.ask_amount_cents,
    sent_on: r.sent_on,
    raisedCents: n(r.raised),
    giftCount: n(r.cnt),
    avgGiftCents: n(r.cnt) ? Math.round(n(r.raised) / n(r.cnt)) : 0,
  }));
}

export interface CampaignTopDonor {
  id: string;
  name: string;
  totalCents: number;
  giftCount: number;
  /** True when ANY of the donor's campaign gifts requested anonymity — callers render "Anonymous". */
  isAnonymous: boolean;
}

export async function campaignTopDonors(orgId: string, campaignId: string, limit = 10): Promise<CampaignTopDonor[]> {
  assertOrgId(orgId);
  const lim = Math.min(Math.max(limit, 1), 100);
  const rows = (await sql`
    SELECT c.id,
           COALESCE(NULLIF(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email, 'Unknown') AS name,
           SUM(g.amount_cents)::bigint AS total,
           COUNT(*)::int AS cnt,
           bool_or(g.is_anonymous) AS is_anonymous
    FROM gifts g JOIN constituents c ON c.id = g.constituent_id
    WHERE g.org_id = ${orgId} AND g.campaign_id = ${campaignId} AND g.status = 'succeeded'
    GROUP BY c.id, name
    ORDER BY total DESC
    LIMIT ${lim}
  `) as unknown as Array<{ id: string; name: string; total: string; cnt: number; is_anonymous: boolean }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    totalCents: n(r.total),
    giftCount: n(r.cnt),
    isAnonymous: Boolean(r.is_anonymous),
  }));
}

export interface DonorWallEntry {
  displayName: string;
  amountCents: number;
  receivedAt: Date | null;
}

/** Recent gifts for the public donor wall — anonymity masked here, never in the UI. */
export async function campaignDonorWall(orgId: string, campaignId: string, limit = 30): Promise<DonorWallEntry[]> {
  assertOrgId(orgId);
  const lim = Math.min(Math.max(limit, 1), 100);
  const rows = (await sql`
    SELECT g.amount_cents, g.received_at, g.is_anonymous,
           c.first_name, c.last_name, c.org_name
    FROM gifts g JOIN constituents c ON c.id = g.constituent_id
    WHERE g.org_id = ${orgId} AND g.campaign_id = ${campaignId} AND g.status = 'succeeded'
    ORDER BY g.received_at DESC NULLS LAST, g.created_at DESC
    LIMIT ${lim}
  `) as unknown as Array<{
    amount_cents: number; received_at: Date | null; is_anonymous: boolean;
    first_name: string | null; last_name: string | null; org_name: string | null;
  }>;
  return rows.map((r) => {
    let displayName = "Anonymous";
    if (!r.is_anonymous) {
      const first = r.first_name?.trim();
      const lastInitial = r.last_name?.trim()?.[0];
      displayName = first
        ? `${first}${lastInitial ? ` ${lastInitial}.` : ""}`
        : r.org_name?.trim() || "A supporter";
    }
    return { displayName, amountCents: n(r.amount_cents), receivedAt: r.received_at };
  });
}
