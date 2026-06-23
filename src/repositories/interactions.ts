import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Interaction, InteractionType } from "@/types/db";

/**
 * Interactions — the per-constituent activity timeline. Manual touches (call,
 * meeting, note) are logged from the constituent page; Tidings sends auto-log
 * via `bulkLogInteractions`. All org-scoped.
 */

export async function listInteractions(orgId: string, constituentId: string): Promise<Interaction[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM interactions
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId}
    ORDER BY occurred_at DESC, created_at DESC
  `) as unknown as Interaction[];
}

export async function createInteraction(
  orgId: string,
  input: {
    constituentId: string;
    type: InteractionType;
    subject?: string | null;
    body?: string | null;
    occurredAt?: Date | null;
    createdBy?: string | null;
  },
): Promise<Interaction> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO interactions (org_id, constituent_id, type, subject, body, occurred_at, created_by)
    VALUES (
      ${orgId}, ${input.constituentId}, ${input.type}, ${input.subject ?? null}, ${input.body ?? null},
      ${input.occurredAt ?? new Date()}, ${input.createdBy ?? null}
    )
    RETURNING *
  `) as unknown as Interaction[];
  return rows[0]!;
}

export async function deleteInteraction(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM interactions WHERE org_id = ${orgId} AND id = ${id}`;
}

/**
 * Auto-log one interaction per constituent for a completed Tidings send. Single
 * multi-row insert (mirrors bulkInsertRecipients' cost profile). No-op on empty.
 */
export async function bulkLogInteractions(
  orgId: string,
  rows: { constituentId: string; type: InteractionType; subject: string | null }[],
): Promise<void> {
  assertOrgId(orgId);
  const valid = rows.filter((r) => r.constituentId);
  if (valid.length === 0) return;
  const constituentIds = valid.map((r) => r.constituentId);
  const types = valid.map((r) => r.type);
  const subjects = valid.map((r) => r.subject);
  // unnest the parallel arrays into rows — one statement regardless of count.
  await sql`
    INSERT INTO interactions (org_id, constituent_id, type, subject)
    SELECT ${orgId}, c, t, s
    FROM unnest(${constituentIds}::uuid[], ${types}::text[], ${subjects}::text[]) AS u(c, t, s)
  `;
}
