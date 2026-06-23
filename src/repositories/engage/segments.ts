import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Constituent } from "@/types/db";
import type { EngageSegment, SegmentCriteria } from "@/types/engage";

/**
 * Saved segments — reusable, dynamic audience criteria. The criteria resolver
 * (`resolveSegmentRows`) lives here so both the segment preview and
 * resolveAudience's "segment" branch share one definition. Org-scoped.
 */

export async function listSegments(orgId: string): Promise<EngageSegment[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM engage_segments WHERE org_id = ${orgId} ORDER BY name ASC
  `) as unknown as EngageSegment[];
}

export async function getSegment(orgId: string, id: string): Promise<EngageSegment | null> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM engage_segments WHERE org_id = ${orgId} AND id = ${id}
  `) as unknown as EngageSegment[];
  return rows[0] ?? null;
}

export async function createSegment(
  orgId: string,
  input: { name: string; description?: string | null; criteria: SegmentCriteria; createdBy?: string | null },
): Promise<EngageSegment> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO engage_segments (org_id, name, description, criteria_json, created_by)
    VALUES (${orgId}, ${input.name}, ${input.description ?? null}, ${JSON.stringify(input.criteria)}::jsonb, ${input.createdBy ?? null})
    RETURNING *
  `) as unknown as EngageSegment[];
  return rows[0]!;
}

export async function updateSegment(
  orgId: string,
  id: string,
  input: { name: string; description?: string | null; criteria: SegmentCriteria },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE engage_segments
    SET name = ${input.name}, description = ${input.description ?? null},
        criteria_json = ${JSON.stringify(input.criteria)}::jsonb, updated_at = now()
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function deleteSegment(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM engage_segments WHERE org_id = ${orgId} AND id = ${id}`;
}

/**
 * Resolve segment criteria to constituent rows (NO consent filtering — that is
 * applied by resolveAudience per channel). Every criterion is optional and ANDed;
 * each is a NULL-guarded predicate so this stays a single parameterized template.
 * Gift-based filters consider only succeeded gifts; the date filter uses the gift
 * date (received_at, falling back to created_at).
 */
export async function resolveSegmentRows(orgId: string, criteria: SegmentCriteria): Promise<Constituent[]> {
  assertOrgId(orgId);
  const fundIds = criteria.fundIds?.length ? criteria.fundIds : null;
  const givingMin = criteria.givingMinCents ?? null;
  const givingMax = criteria.givingMaxCents ?? null;
  const giftSince = criteria.giftSince || null;
  const giftUntil = criteria.giftUntil || null;
  const type = criteria.constituentType ?? null;

  return (await sql`
    SELECT c.* FROM constituents c
    WHERE c.org_id = ${orgId}
      AND (${type}::text IS NULL OR c.type = ${type})
      AND (${fundIds}::uuid[] IS NULL OR EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = c.org_id AND g.constituent_id = c.id
              AND g.status = 'succeeded' AND g.fund_id = ANY(${fundIds}::uuid[])))
      AND (${giftSince}::date IS NULL OR EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = c.org_id AND g.constituent_id = c.id
              AND g.status = 'succeeded'
              AND coalesce(g.received_at, g.created_at) >= ${giftSince}::date))
      AND (${giftUntil}::date IS NULL OR EXISTS (
            SELECT 1 FROM gifts g
            WHERE g.org_id = c.org_id AND g.constituent_id = c.id
              AND g.status = 'succeeded'
              AND coalesce(g.received_at, g.created_at) < (${giftUntil}::date + 1)))
      AND (${givingMin}::bigint IS NULL OR (
            SELECT coalesce(sum(g.amount_cents), 0) FROM gifts g
            WHERE g.org_id = c.org_id AND g.constituent_id = c.id AND g.status = 'succeeded'
          ) >= ${givingMin}::bigint)
      AND (${givingMax}::bigint IS NULL OR (
            SELECT coalesce(sum(g.amount_cents), 0) FROM gifts g
            WHERE g.org_id = c.org_id AND g.constituent_id = c.id AND g.status = 'succeeded'
          ) <= ${givingMax}::bigint)
  `) as unknown as Constituent[];
}
