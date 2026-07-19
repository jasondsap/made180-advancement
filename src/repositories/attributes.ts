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
  await addRoles(orgId, constituentId, [role]);
}

/**
 * Add several roles at once (multi-select tagging). Normalizes (trim+lowercase),
 * de-dupes the input, and skips any already on the record — one statement.
 */
export async function addRoles(orgId: string, constituentId: string, roles: string[]): Promise<void> {
  assertOrgId(orgId);
  const values = [...new Set(roles.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  if (values.length === 0) return;
  await sql`
    INSERT INTO constituent_attributes (org_id, constituent_id, attr_key, attr_value)
    SELECT ${orgId}, ${constituentId}, ${ROLE_KEY}, v
    FROM unnest(${values}::text[]) AS v
    WHERE NOT EXISTS (
      SELECT 1 FROM constituent_attributes ca
      WHERE ca.org_id = ${orgId} AND ca.constituent_id = ${constituentId}
        AND ca.attr_key = ${ROLE_KEY} AND ca.attr_value = v
    )
  `;
}

/**
 * Roles for a set of constituents, batched into one query (for the list view —
 * avoids an N+1 over the page's rows). Returns a map of constituent id → roles.
 */
export async function rolesForConstituents(
  orgId: string,
  ids: string[],
): Promise<Map<string, string[]>> {
  assertOrgId(orgId);
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;
  const rows = (await sql`
    SELECT constituent_id, attr_value FROM constituent_attributes
    WHERE org_id = ${orgId} AND attr_key = ${ROLE_KEY} AND constituent_id = ANY(${ids}::uuid[])
    ORDER BY attr_value
  `) as unknown as Array<{ constituent_id: string; attr_value: string }>;
  for (const r of rows) {
    const list = out.get(r.constituent_id);
    if (list) list.push(r.attr_value);
    else out.set(r.constituent_id, [r.attr_value]);
  }
  return out;
}

export async function removeRole(orgId: string, constituentId: string, role: string): Promise<void> {
  assertOrgId(orgId);
  await sql`
    DELETE FROM constituent_attributes
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId}
      AND attr_key = ${ROLE_KEY} AND attr_value = ${role.trim().toLowerCase()}
  `;
}

/**
 * Suggested roles (the datalist / checkboxes). Free-text is still allowed, so
 * this is a convenience list, not a constraint. Values are stored lowercase
 * (see addRoles), so these read as their display form when shown back.
 * `board member`/`board` and `grantor`/`grant officer` are kept distinct on
 * purpose — pre-existing `board` tags keep working.
 */
export const KNOWN_ROLES = [
  "donor",
  "first-time donor",
  "recurring donor",
  "major donor",
  "lapsed donor",
  "prospect",
  "corporate sponsor",
  "partner",
  "ambassador",
  "volunteer",
  "event attendee",
  "board member",
  "staff",
  "grantor",
  "grant officer",
  "vendor",
] as const;
