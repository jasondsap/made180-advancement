import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Fund } from "@/types/db";

/**
 * Fund repository. Every query is scoped to org_id. Funds are referenced by
 * `code` on the public donation page (e.g. 'general', 'village') and by id
 * everywhere internal.
 */

export async function listFunds(
  orgId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Fund[]> {
  assertOrgId(orgId);
  if (opts.activeOnly) {
    return (await sql`
      SELECT * FROM funds
      WHERE org_id = ${orgId} AND active = true
      ORDER BY name
    `) as unknown as Fund[];
  }
  return (await sql`
    SELECT * FROM funds
    WHERE org_id = ${orgId}
    ORDER BY name
  `) as unknown as Fund[];
}

export async function getFundByCode(
  orgId: string,
  code: string,
): Promise<Fund | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM funds
    WHERE org_id = ${orgId} AND code = ${code}
    LIMIT 1
  `) as unknown as Fund[];
  return rows[0];
}

export async function createFund(
  orgId: string,
  f: { code: string; name: string; restricted: boolean },
): Promise<Fund> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO funds (org_id, code, name, restricted, active)
    VALUES (${orgId}, ${f.code.trim().toLowerCase()}, ${f.name}, ${f.restricted}, true)
    RETURNING *
  `) as unknown as Fund[];
  return rows[0]!;
}

export async function updateFund(
  orgId: string,
  id: string,
  f: { name: string; restricted: boolean; active: boolean },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE funds SET name = ${f.name}, restricted = ${f.restricted}, active = ${f.active}
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function getFundById(
  orgId: string,
  id: string,
): Promise<Fund | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM funds
    WHERE org_id = ${orgId} AND id = ${id}
    LIMIT 1
  `) as unknown as Fund[];
  return rows[0];
}
