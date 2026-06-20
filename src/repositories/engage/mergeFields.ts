import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { EngageMergeField } from "@/types/engage";

/** Merge fields: variables resolved against a constituent at render time. */

const DEFAULTS: { name: string; tag: string }[] = [
  { name: "First name", tag: "{{contact.first_name}}" },
  { name: "Primary Email", tag: "{{contact.primary_email}}" },
  { name: "Primary Phone", tag: "{{contact.primary_phone}}" },
  { name: "Full Address", tag: "{{contact.full_address}}" },
];

export async function listMergeFields(orgId: string): Promise<EngageMergeField[]> {
  assertOrgId(orgId);
  return (await sql`SELECT * FROM engage_merge_fields WHERE org_id = ${orgId} ORDER BY created_at`) as unknown as EngageMergeField[];
}

/** Idempotently seed the standard merge fields for an org (no-op if present). */
export async function seedDefaultMergeFields(orgId: string): Promise<void> {
  assertOrgId(orgId);
  for (const d of DEFAULTS) {
    await sql`
      INSERT INTO engage_merge_fields (org_id, name, tag)
      VALUES (${orgId}, ${d.name}, ${d.tag})
      ON CONFLICT (org_id, tag) DO NOTHING
    `;
  }
}

export async function createMergeField(
  orgId: string,
  m: { name: string; tag: string; defaultValue?: string | null },
): Promise<EngageMergeField> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO engage_merge_fields (org_id, name, tag, default_value)
    VALUES (${orgId}, ${m.name.trim()}, ${m.tag.trim()}, ${m.defaultValue ?? null})
    ON CONFLICT (org_id, tag) DO UPDATE SET name = EXCLUDED.name, default_value = EXCLUDED.default_value
    RETURNING *
  `) as unknown as EngageMergeField[];
  return rows[0]!;
}

export async function updateMergeFieldDefault(orgId: string, id: string, defaultValue: string | null): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE engage_merge_fields SET default_value = ${defaultValue} WHERE org_id = ${orgId} AND id = ${id}`;
}

export async function deleteMergeField(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM engage_merge_fields WHERE org_id = ${orgId} AND id = ${id}`;
}
