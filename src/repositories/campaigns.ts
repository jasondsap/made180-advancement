import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

export const CAMPAIGN_CATEGORIES = ["annual", "capital", "event", "giving_day", "memorial"] as const;
export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  goal_cents: number | null;
  /** pg returns `date` columns as JS Dates; use isoDay() from @/lib/format to normalize. */
  starts_on: string | Date | null;
  ends_on: string | Date | null;
  description: string | null;
  category: string | null;
  cover_image_url: string | null;
  public_slug: string | null;
  active: boolean;
  created_at: Date;
}

export async function listCampaigns(orgId: string): Promise<Campaign[]> {
  assertOrgId(orgId);
  return (await sql`SELECT * FROM campaigns WHERE org_id = ${orgId} ORDER BY created_at DESC`) as unknown as Campaign[];
}

export async function getCampaignById(orgId: string, id: string): Promise<Campaign | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM campaigns WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as Campaign[];
  return rows[0];
}

/** Public campaign page resolver — org resolved from the URL slug upstream. Active only. */
export async function getCampaignByPublicSlug(orgId: string, publicSlug: string): Promise<Campaign | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM campaigns
    WHERE org_id = ${orgId} AND lower(public_slug) = lower(${publicSlug}) AND active = true
    LIMIT 1
  `) as unknown as Campaign[];
  return rows[0];
}

/** Most recent prior campaign of the same category (for YoY comparison). */
export async function getPriorCampaign(orgId: string, campaign: Campaign): Promise<Campaign | undefined> {
  assertOrgId(orgId);
  if (!campaign.category || !campaign.starts_on) return undefined;
  const rows = (await sql`
    SELECT * FROM campaigns
    WHERE org_id = ${orgId} AND category = ${campaign.category}
      AND id <> ${campaign.id} AND starts_on < ${campaign.starts_on}
    ORDER BY starts_on DESC NULLS LAST
    LIMIT 1
  `) as unknown as Campaign[];
  return rows[0];
}

export interface CampaignInput {
  name: string;
  goalCents: number | null;
  startsOn: string | null;
  endsOn: string | null;
  description?: string | null;
  category?: string | null;
  coverImageUrl?: string | null;
  publicSlug?: string | null;
}

export async function createCampaign(orgId: string, c: CampaignInput): Promise<Campaign> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO campaigns (org_id, name, goal_cents, starts_on, ends_on, description, category, cover_image_url, public_slug, active)
    VALUES (${orgId}, ${c.name}, ${c.goalCents}, ${c.startsOn}, ${c.endsOn},
            ${c.description ?? null}, ${c.category ?? null}, ${c.coverImageUrl ?? null}, ${c.publicSlug ?? null}, true)
    RETURNING *
  `) as unknown as Campaign[];
  return rows[0]!;
}

export async function updateCampaign(
  orgId: string,
  id: string,
  c: CampaignInput & { active: boolean },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE campaigns SET
      name = ${c.name}, goal_cents = ${c.goalCents},
      starts_on = ${c.startsOn}, ends_on = ${c.endsOn},
      description = ${c.description ?? null}, category = ${c.category ?? null},
      cover_image_url = ${c.coverImageUrl ?? null}, public_slug = ${c.publicSlug ?? null},
      active = ${c.active}
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}
