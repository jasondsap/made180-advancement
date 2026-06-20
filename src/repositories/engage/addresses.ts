import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { EngageAddress, AddressType } from "@/types/engage";

/** Saved Engage addresses (org address shown in email footers; mailing/return). */

export async function listAddresses(orgId: string): Promise<EngageAddress[]> {
  assertOrgId(orgId);
  return (await sql`SELECT * FROM engage_addresses WHERE org_id = ${orgId} ORDER BY type, created_at`) as unknown as EngageAddress[];
}

export async function getAddressByType(orgId: string, type: AddressType): Promise<EngageAddress | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM engage_addresses WHERE org_id = ${orgId} AND type = ${type} ORDER BY created_at LIMIT 1`) as unknown as EngageAddress[];
  return rows[0];
}

export async function createAddress(
  orgId: string,
  a: { type: AddressType; line1: string; line2?: string | null; city: string; state: string; postalCode: string; country?: string },
): Promise<EngageAddress> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO engage_addresses (org_id, type, line1, line2, city, state, postal_code, country)
    VALUES (${orgId}, ${a.type}, ${a.line1.trim()}, ${a.line2 ?? null}, ${a.city.trim()}, ${a.state.trim()}, ${a.postalCode.trim()}, ${a.country ?? "US"})
    RETURNING *
  `) as unknown as EngageAddress[];
  return rows[0]!;
}

export async function deleteAddress(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM engage_addresses WHERE org_id = ${orgId} AND id = ${id}`;
}
