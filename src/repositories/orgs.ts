import { sql } from "@/lib/db";
import type { Org } from "@/types/db";

/**
 * orgs is the tenant table itself, so these resolvers are the ONE acceptable
 * exception to the "orgId is the first argument" rule — they are how an org id
 * is established in the first place:
 *   - getOrgBySlug: public donation page (/give/[orgSlug])
 *   - getOrgById:   after the Cognito session yields a membership's org_id
 * Everything downstream takes the resolved org.id as its first argument.
 */

export async function getOrgBySlug(slug: string): Promise<Org | undefined> {
  const normalized = slug.trim().toLowerCase();
  const rows = (await sql`
    SELECT * FROM orgs WHERE slug = ${normalized} LIMIT 1
  `) as unknown as Org[];
  return rows[0];
}

export async function getOrgById(id: string): Promise<Org | undefined> {
  const rows = (await sql`
    SELECT * FROM orgs WHERE id = ${id} LIMIT 1
  `) as unknown as Org[];
  return rows[0];
}

import { assertOrgId } from "@/lib/tenancy";
import type { AddressJson } from "@/types/db";

export async function updateOrgSettings(
  orgId: string,
  s: {
    legalName: string;
    ein: string | null;
    receiptFromEmail: string | null;
    receiptSignatureName: string | null;
    address: AddressJson | null;
  },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE orgs SET
      legal_name = ${s.legalName},
      ein = ${s.ein},
      receipt_from_email = ${s.receiptFromEmail},
      receipt_signature_name = ${s.receiptSignatureName},
      address_json = ${s.address ? JSON.stringify(s.address) : null}::jsonb
    WHERE id = ${orgId}
  `;
}
