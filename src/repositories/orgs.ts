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

/**
 * Cross-tenant org listing. Like the slug/id resolvers above, this is a
 * documented exception to the orgId-first rule — it is only ever called from
 * the super_admin console (requireSuperAdmin gates every caller) and to seed
 * the org switcher / active-org fallback.
 */
export async function listAllOrgs(): Promise<Org[]> {
  return (await sql`SELECT * FROM orgs ORDER BY legal_name`) as unknown as Org[];
}

/** Resolve a set of orgs by id (org switcher for multi-org non-super users). */
export async function listOrgsByIds(ids: string[]): Promise<Org[]> {
  if (ids.length === 0) return [];
  return (await sql`
    SELECT * FROM orgs WHERE id = ANY(${ids}::uuid[]) ORDER BY legal_name
  `) as unknown as Org[];
}

import { assertOrgId } from "@/lib/tenancy";
import type { AddressJson } from "@/types/db";

/** Provision a new tenant org. super_admin console only. Slug must be unique. */
export async function createOrg(input: {
  slug: string;
  legalName: string;
  ein?: string | null;
  receiptFromEmail?: string | null;
  receiptSignatureName?: string | null;
}): Promise<Org> {
  const rows = (await sql`
    INSERT INTO orgs (slug, legal_name, ein, receipt_from_email, receipt_signature_name)
    VALUES (
      ${input.slug.trim().toLowerCase()},
      ${input.legalName.trim()},
      ${input.ein ?? null},
      ${input.receiptFromEmail ?? null},
      ${input.receiptSignatureName ?? null}
    )
    RETURNING *
  `) as unknown as Org[];
  return rows[0]!;
}

/** Bind an org to its Stripe Connect (Express) account. */
export async function setStripeAccountId(orgId: string, stripeAccountId: string): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE orgs SET stripe_account_id = ${stripeAccountId} WHERE id = ${orgId}`;
}

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
