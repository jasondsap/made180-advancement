import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

export const APPEAL_CHANNELS = ["web", "email", "event", "mail", "phone"] as const;

export interface Appeal {
  id: string;
  org_id: string;
  campaign_id: string | null;
  name: string;
  channel: string | null;
  created_at: Date;
}

export interface AppealWithCampaign extends Appeal {
  campaign_name: string | null;
}

export async function listAppeals(orgId: string): Promise<AppealWithCampaign[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT a.*, c.name AS campaign_name
    FROM appeals a LEFT JOIN campaigns c ON c.id = a.campaign_id
    WHERE a.org_id = ${orgId}
    ORDER BY a.created_at DESC
  `) as unknown as AppealWithCampaign[];
}

export async function getAppealById(orgId: string, id: string): Promise<Appeal | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM appeals WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as Appeal[];
  return rows[0];
}

export async function createAppeal(
  orgId: string,
  a: { name: string; campaignId: string | null; channel: string | null },
): Promise<Appeal> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO appeals (org_id, campaign_id, name, channel)
    VALUES (${orgId}, ${a.campaignId}, ${a.name}, ${a.channel})
    RETURNING *
  `) as unknown as Appeal[];
  return rows[0]!;
}
