import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  goal_cents: number | null;
  starts_on: string | null;
  ends_on: string | null;
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

export async function createCampaign(
  orgId: string,
  c: { name: string; goalCents: number | null; startsOn: string | null; endsOn: string | null },
): Promise<Campaign> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO campaigns (org_id, name, goal_cents, starts_on, ends_on, active)
    VALUES (${orgId}, ${c.name}, ${c.goalCents}, ${c.startsOn}, ${c.endsOn}, true)
    RETURNING *
  `) as unknown as Campaign[];
  return rows[0]!;
}

export async function updateCampaign(
  orgId: string,
  id: string,
  c: { name: string; goalCents: number | null; active: boolean },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE campaigns SET name = ${c.name}, goal_cents = ${c.goalCents}, active = ${c.active}
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}
