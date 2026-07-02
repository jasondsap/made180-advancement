import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import { isoDay } from "@/lib/format";
import type { Campaign } from "@/repositories/campaigns";

/**
 * Campaign-relative donor segments for the Asks flow. Each resolver returns
 * constituent ids only — consent filtering stays where it belongs, in
 * resolveAudience({ mode: "manual", constituentIds }) at preview and send.
 * All predicates consider succeeded gifts only.
 */

export type CampaignSegmentKey =
  | "lybunt"
  | "sybunt"
  | "first_time"
  | "lapsed"
  | "recurring"
  | "campaign_donors";

/** `description` doubles as audience context in the AI appeal-draft prompt. */
export const CAMPAIGN_SEGMENTS: Record<CampaignSegmentKey, { label: string; description: string }> = {
  lybunt: {
    label: "LYBUNT — gave last year, not this campaign",
    description:
      "donors who gave in the 12 months before this campaign started but have not yet given to this campaign",
  },
  sybunt: {
    label: "SYBUNT — gave some year, not this campaign",
    description:
      "donors who have given before this campaign started but have not yet given to this campaign",
  },
  first_time: {
    label: "First-time donors",
    description: "donors whose very first gift is their only gift so far — a welcome-and-repeat ask",
  },
  lapsed: {
    label: "Lapsed donors (18+ months)",
    description:
      "donors who have given in the past but not in the last 18 months and not to this campaign — a win-back ask",
  },
  recurring: {
    label: "Recurring donors",
    description: "donors with an active recurring giving plan — loyal monthly supporters",
  },
  campaign_donors: {
    label: "Gave to this campaign",
    description: "donors who have already given to this campaign — a thank-you or upgrade ask",
  },
};

function campaignStart(campaign: Campaign): string {
  return isoDay(campaign.starts_on) ?? isoDay(new Date(campaign.created_at))!;
}

export async function resolveCampaignSegment(
  orgId: string,
  campaign: Campaign,
  key: CampaignSegmentKey,
): Promise<string[]> {
  assertOrgId(orgId);
  const start = campaignStart(campaign);

  let rows: Array<{ id: string }>;
  switch (key) {
    case "lybunt":
      rows = (await sql`
        SELECT c.id FROM constituents c
        WHERE c.org_id = ${orgId}
          AND EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = ${orgId} AND g.constituent_id = c.id AND g.status = 'succeeded'
              AND g.received_at >= ${start}::date - interval '1 year'
              AND g.received_at < ${start}::date)
          AND NOT EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = ${orgId} AND g.constituent_id = c.id AND g.status = 'succeeded'
              AND g.campaign_id = ${campaign.id})
      `) as unknown as Array<{ id: string }>;
      break;
    case "sybunt":
      rows = (await sql`
        SELECT c.id FROM constituents c
        WHERE c.org_id = ${orgId}
          AND EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = ${orgId} AND g.constituent_id = c.id AND g.status = 'succeeded'
              AND g.received_at < ${start}::date)
          AND NOT EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = ${orgId} AND g.constituent_id = c.id AND g.status = 'succeeded'
              AND g.campaign_id = ${campaign.id})
      `) as unknown as Array<{ id: string }>;
      break;
    case "first_time":
      rows = (await sql`
        SELECT constituent_id AS id FROM gifts
        WHERE org_id = ${orgId} AND status = 'succeeded'
        GROUP BY constituent_id
        HAVING COUNT(*) = 1
      `) as unknown as Array<{ id: string }>;
      break;
    case "lapsed":
      rows = (await sql`
        SELECT c.id FROM constituents c
        WHERE c.org_id = ${orgId}
          AND EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = ${orgId} AND g.constituent_id = c.id AND g.status = 'succeeded')
          AND NOT EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = ${orgId} AND g.constituent_id = c.id AND g.status = 'succeeded'
              AND g.received_at >= now() - interval '18 months')
          AND NOT EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = ${orgId} AND g.constituent_id = c.id AND g.status = 'succeeded'
              AND g.campaign_id = ${campaign.id})
      `) as unknown as Array<{ id: string }>;
      break;
    case "recurring":
      rows = (await sql`
        SELECT DISTINCT constituent_id AS id FROM recurring_plans
        WHERE org_id = ${orgId} AND status = 'active' AND constituent_id IS NOT NULL
      `) as unknown as Array<{ id: string }>;
      break;
    case "campaign_donors":
      rows = (await sql`
        SELECT DISTINCT constituent_id AS id FROM gifts
        WHERE org_id = ${orgId} AND campaign_id = ${campaign.id} AND status = 'succeeded'
      `) as unknown as Array<{ id: string }>;
      break;
  }
  return rows.map((r) => r.id);
}
