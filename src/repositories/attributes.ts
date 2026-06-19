import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

/**
 * Constituent attributes (EAV). Used here for first-class ROLES (donor,
 * volunteer, board, grantor, ...) stored as attr_key='role' rows — the scope's
 * "one person, many roles" without a rigid column.
 */
const ROLE_KEY = "role";

export async function listRoles(orgId: string, constituentId: string): Promise<string[]> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT attr_value FROM constituent_attributes
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId} AND attr_key = ${ROLE_KEY}
    ORDER BY attr_value
  `) as unknown as Array<{ attr_value: string }>;
  return rows.map((r) => r.attr_value);
}

export async function addRole(orgId: string, constituentId: string, role: string): Promise<void> {
  assertOrgId(orgId);
  const value = role.trim().toLowerCase();
  if (!value) return;
  // avoid duplicates
  await sql`
    INSERT INTO constituent_attributes (org_id, constituent_id, attr_key, attr_value)
    SELECT ${orgId}, ${constituentId}, ${ROLE_KEY}, ${value}
    WHERE NOT EXISTS (
      SELECT 1 FROM constituent_attributes
      WHERE org_id = ${orgId} AND constituent_id = ${constituentId}
        AND attr_key = ${ROLE_KEY} AND attr_value = ${value}
    )
  `;
}

export async function removeRole(orgId: string, constituentId: string, role: string): Promise<void> {
  assertOrgId(orgId);
  await sql`
    DELETE FROM constituent_attributes
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId}
      AND attr_key = ${ROLE_KEY} AND attr_value = ${role.trim().toLowerCase()}
  `;
}

export const KNOWN_ROLES = ["donor", "volunteer", "board", "grantor", "staff", "vendor"] as const;
