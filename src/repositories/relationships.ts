import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

/**
 * Constituent relationships (household, spouse, employer, soft_credit_to).
 * Directional from_id -> to_id. Org-scoped.
 */
export const REL_TYPES = ["household", "spouse", "employer", "soft_credit_to"] as const;

export interface RelationshipRow {
  id: string;
  rel_type: string;
  other_id: string;
  other_name: string;
  direction: "out" | "in";
}

/** All relationships touching a constituent, with the other party's display name. */
export async function listRelationships(orgId: string, constituentId: string): Promise<RelationshipRow[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT r.id, r.rel_type,
           CASE WHEN r.from_id = ${constituentId} THEN r.to_id ELSE r.from_id END AS other_id,
           COALESCE(
             NULLIF(trim(coalesce(o.first_name,'') || ' ' || coalesce(o.last_name,'')), ''),
             o.org_name, o.email, 'Unknown'
           ) AS other_name,
           CASE WHEN r.from_id = ${constituentId} THEN 'out' ELSE 'in' END AS direction
    FROM constituent_relationships r
    JOIN constituents o
      ON o.id = CASE WHEN r.from_id = ${constituentId} THEN r.to_id ELSE r.from_id END
    WHERE r.org_id = ${orgId} AND (r.from_id = ${constituentId} OR r.to_id = ${constituentId})
    ORDER BY r.rel_type
  `) as unknown as RelationshipRow[];
}

export async function addRelationship(
  orgId: string,
  fromId: string,
  toId: string,
  relType: string,
): Promise<void> {
  assertOrgId(orgId);
  if (fromId === toId) throw new Error("Cannot relate a constituent to itself");
  await sql`
    INSERT INTO constituent_relationships (org_id, from_id, to_id, rel_type)
    VALUES (${orgId}, ${fromId}, ${toId}, ${relType})
  `;
}

export async function removeRelationship(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM constituent_relationships WHERE org_id = ${orgId} AND id = ${id}`;
}
