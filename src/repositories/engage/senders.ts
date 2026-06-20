import { sql, getSql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { EngageSender } from "@/types/engage";

/** Engage senders (From identities). All queries org-scoped. */

export async function listSenders(orgId: string): Promise<EngageSender[]> {
  assertOrgId(orgId);
  return (await sql`SELECT * FROM engage_senders WHERE org_id = ${orgId} ORDER BY is_default DESC, created_at`) as unknown as EngageSender[];
}

export async function getDefaultSender(orgId: string): Promise<EngageSender | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM engage_senders WHERE org_id = ${orgId} ORDER BY is_default DESC, created_at LIMIT 1`) as unknown as EngageSender[];
  return rows[0];
}

export async function getSender(orgId: string, id: string): Promise<EngageSender | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM engage_senders WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as EngageSender[];
  return rows[0];
}

export async function createSender(
  orgId: string,
  s: { fromName: string; fromEmail: string; replyTo?: string | null; domainId?: string | null; isDefault?: boolean },
): Promise<EngageSender> {
  assertOrgId(orgId);
  const makeDefault = s.isDefault ?? false;
  const stmts = [];
  if (makeDefault) {
    stmts.push(getSql()`UPDATE engage_senders SET is_default = false WHERE org_id = ${orgId} AND is_default = true`);
  }
  // Run the de-default (if any) then the insert atomically.
  if (stmts.length) await getSql().transaction(stmts);
  const rows = (await sql`
    INSERT INTO engage_senders (org_id, domain_id, from_name, from_email, reply_to, is_default)
    VALUES (${orgId}, ${s.domainId ?? null}, ${s.fromName.trim()}, ${s.fromEmail.trim().toLowerCase()}, ${s.replyTo ?? null}, ${makeDefault})
    RETURNING *
  `) as unknown as EngageSender[];
  return rows[0]!;
}

export async function setDefaultSender(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  const s = getSql();
  await s.transaction([
    s`UPDATE engage_senders SET is_default = false WHERE org_id = ${orgId} AND is_default = true`,
    s`UPDATE engage_senders SET is_default = true WHERE org_id = ${orgId} AND id = ${id}`,
  ]);
}

export async function deleteSender(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM engage_senders WHERE org_id = ${orgId} AND id = ${id}`;
}
