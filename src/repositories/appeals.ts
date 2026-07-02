import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

export const APPEAL_CHANNELS = ["web", "email", "event", "mail", "phone"] as const;

export interface Appeal {
  id: string;
  org_id: string;
  campaign_id: string | null;
  name: string;
  channel: string | null;
  ask_amount_cents: number | null;
  /** pg returns `date` columns as JS Dates; use isoDay() from @/lib/format to normalize. */
  sent_on: string | Date | null;
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

export async function listAppealsForCampaign(orgId: string, campaignId: string): Promise<Appeal[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM appeals
    WHERE org_id = ${orgId} AND campaign_id = ${campaignId}
    ORDER BY created_at DESC
  `) as unknown as Appeal[];
}

export async function getAppealById(orgId: string, id: string): Promise<Appeal | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM appeals WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as Appeal[];
  return rows[0];
}

export async function createAppeal(
  orgId: string,
  a: {
    name: string;
    campaignId: string | null;
    channel: string | null;
    askAmountCents?: number | null;
    sentOn?: string | null;
  },
): Promise<Appeal> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO appeals (org_id, campaign_id, name, channel, ask_amount_cents, sent_on)
    VALUES (${orgId}, ${a.campaignId}, ${a.name}, ${a.channel}, ${a.askAmountCents ?? null}, ${a.sentOn ?? null})
    RETURNING *
  `) as unknown as Appeal[];
  return rows[0]!;
}

export async function updateAppeal(
  orgId: string,
  id: string,
  a: { name: string; channel: string | null; askAmountCents: number | null; sentOn: string | null },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE appeals SET name = ${a.name}, channel = ${a.channel},
      ask_amount_cents = ${a.askAmountCents}, sent_on = ${a.sentOn}
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

/** Safe: gifts.appeal_id and engage_messages.appeal_id are ON DELETE SET NULL. */
export async function deleteAppeal(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM appeals WHERE org_id = ${orgId} AND id = ${id}`;
}
