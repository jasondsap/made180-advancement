import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { P2PMember } from "@/types/db";

/** Peer-to-peer members. raised is derived from gifts.p2p_member_id (succeeded). */
export interface P2PMemberWithRaised extends P2PMember {
  raised_cents: number;
  supporter_count: number;
}

export async function listMembers(orgId: string, fundraiserId: string): Promise<P2PMemberWithRaised[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT m.*,
           COALESCE(g.raised_cents, 0)::int AS raised_cents,
           COALESCE(g.supporter_count, 0)::int AS supporter_count
    FROM p2p_members m
    LEFT JOIN (
      SELECT p2p_member_id, SUM(amount_cents) AS raised_cents, COUNT(DISTINCT constituent_id) AS supporter_count
      FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded' AND p2p_member_id IS NOT NULL
      GROUP BY p2p_member_id
    ) g ON g.p2p_member_id = m.id
    WHERE m.org_id = ${orgId} AND m.fundraiser_id = ${fundraiserId}
    ORDER BY raised_cents DESC, m.created_at
  `) as unknown as P2PMemberWithRaised[];
}

export async function getMemberWithRaised(orgId: string, id: string): Promise<P2PMemberWithRaised | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT m.*,
           COALESCE(g.raised_cents, 0)::int AS raised_cents,
           COALESCE(g.supporter_count, 0)::int AS supporter_count
    FROM p2p_members m
    LEFT JOIN (
      SELECT p2p_member_id, SUM(amount_cents) AS raised_cents, COUNT(DISTINCT constituent_id) AS supporter_count
      FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded'
      GROUP BY p2p_member_id
    ) g ON g.p2p_member_id = m.id
    WHERE m.org_id = ${orgId} AND m.id = ${id} LIMIT 1
  `) as unknown as P2PMemberWithRaised[];
  return rows[0];
}

/** Public resolver: a member by parent fundraiser + member slug (org from fundraiser). */
export async function getMemberBySlug(fundraiserId: string, slug: string): Promise<P2PMember | undefined> {
  const rows = (await sql`
    SELECT * FROM p2p_members WHERE fundraiser_id = ${fundraiserId} AND lower(slug) = ${slug.trim().toLowerCase()} LIMIT 1
  `) as unknown as P2PMember[];
  return rows[0];
}

export async function createMember(
  orgId: string,
  fundraiserId: string,
  m: { name: string; slug: string; constituentId?: string | null; goalCents?: number | null; message?: string | null },
): Promise<P2PMember> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO p2p_members (org_id, fundraiser_id, constituent_id, name, slug, goal_cents, message)
    VALUES (${orgId}, ${fundraiserId}, ${m.constituentId ?? null}, ${m.name.trim()}, ${m.slug.trim().toLowerCase()}, ${m.goalCents ?? null}, ${m.message ?? null})
    RETURNING *
  `) as unknown as P2PMember[];
  return rows[0]!;
}

export async function memberSlugExists(fundraiserId: string, slug: string): Promise<boolean> {
  const rows = (await sql`SELECT 1 FROM p2p_members WHERE fundraiser_id = ${fundraiserId} AND lower(slug) = ${slug.toLowerCase()} LIMIT 1`) as unknown as unknown[];
  return rows.length > 0;
}
