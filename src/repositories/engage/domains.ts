import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { EngageDomain } from "@/types/engage";

/** Engage sending domains (Resend). All queries org-scoped. */

export async function listDomains(orgId: string): Promise<EngageDomain[]> {
  assertOrgId(orgId);
  return (await sql`SELECT * FROM engage_domains WHERE org_id = ${orgId} ORDER BY created_at`) as unknown as EngageDomain[];
}

export async function getDomain(orgId: string, id: string): Promise<EngageDomain | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM engage_domains WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as EngageDomain[];
  return rows[0];
}

export async function hasVerifiedDomain(orgId: string): Promise<boolean> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT 1 FROM engage_domains WHERE org_id = ${orgId} AND verified = true LIMIT 1`) as unknown as unknown[];
  return rows.length > 0;
}

export async function createDomain(
  orgId: string,
  d: { domain: string; dnsRecords?: EngageDomain["dns_records"]; resendDomainId?: string | null },
): Promise<EngageDomain> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO engage_domains (org_id, domain, dns_records, resend_domain_id)
    VALUES (${orgId}, ${d.domain.trim().toLowerCase()}, ${d.dnsRecords ? JSON.stringify(d.dnsRecords) : null}::jsonb, ${d.resendDomainId ?? null})
    RETURNING *
  `) as unknown as EngageDomain[];
  return rows[0]!;
}

export async function setDomainVerification(
  orgId: string,
  id: string,
  verified: boolean,
  dnsRecords?: EngageDomain["dns_records"],
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE engage_domains
    SET verified = ${verified},
        dns_records = COALESCE(${dnsRecords ? JSON.stringify(dnsRecords) : null}::jsonb, dns_records)
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function deleteDomain(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM engage_domains WHERE org_id = ${orgId} AND id = ${id}`;
}
