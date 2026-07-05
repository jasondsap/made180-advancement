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
  m: { name: string; slug: string; constituentId?: string | null; goalCents?: number | null; message?: string | null; teamId?: string | null },
): Promise<P2PMember> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO p2p_members (org_id, fundraiser_id, constituent_id, name, slug, goal_cents, message, team_id)
    VALUES (${orgId}, ${fundraiserId}, ${m.constituentId ?? null}, ${m.name.trim()}, ${m.slug.trim().toLowerCase()}, ${m.goalCents ?? null}, ${m.message ?? null}, ${m.teamId ?? null})
    RETURNING *
  `) as unknown as P2PMember[];
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// Teams (migration 0020). Totals derived from member-attributed gifts.
// ---------------------------------------------------------------------------

export interface P2PTeam {
  id: string;
  org_id: string;
  fundraiser_id: string;
  name: string;
  goal_cents: number | null;
  created_at: Date;
}

export interface P2PTeamWithRaised extends P2PTeam {
  member_count: number;
  raised_cents: number;
}

/** Get-or-create a team by name (case-insensitive) during the public join flow. */
export async function getOrCreateTeam(orgId: string, fundraiserId: string, name: string): Promise<P2PTeam> {
  assertOrgId(orgId);
  const clean = name.trim().slice(0, 80);
  const rows = (await sql`
    INSERT INTO p2p_teams (org_id, fundraiser_id, name)
    VALUES (${orgId}, ${fundraiserId}, ${clean})
    ON CONFLICT (fundraiser_id, lower(name)) DO UPDATE SET name = p2p_teams.name
    RETURNING *
  `) as unknown as P2PTeam[];
  return rows[0]!;
}

export async function listTeams(orgId: string, fundraiserId: string): Promise<P2PTeam[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM p2p_teams WHERE org_id = ${orgId} AND fundraiser_id = ${fundraiserId} ORDER BY lower(name)
  `) as unknown as P2PTeam[];
}

/** Team leaderboard: raised = sum of succeeded gifts credited to the team's members. */
export async function listTeamsWithRaised(orgId: string, fundraiserId: string): Promise<P2PTeamWithRaised[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT t.*,
           COUNT(DISTINCT m.id)::int AS member_count,
           COALESCE(SUM(g.amount_cents) FILTER (WHERE g.status = 'succeeded'), 0)::int AS raised_cents
    FROM p2p_teams t
    LEFT JOIN p2p_members m ON m.team_id = t.id
    LEFT JOIN gifts g ON g.p2p_member_id = m.id AND g.org_id = ${orgId}
    WHERE t.org_id = ${orgId} AND t.fundraiser_id = ${fundraiserId}
    GROUP BY t.id
    ORDER BY raised_cents DESC, lower(t.name)
  `) as unknown as P2PTeamWithRaised[];
}

/** Public resolver: team name lookup for a member's page badge. */
export async function getTeamById(orgId: string, id: string): Promise<P2PTeam | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM p2p_teams WHERE org_id = ${orgId} AND id = ${id} LIMIT 1
  `) as unknown as P2PTeam[];
  return rows[0];
}

export async function memberSlugExists(fundraiserId: string, slug: string): Promise<boolean> {
  const rows = (await sql`SELECT 1 FROM p2p_members WHERE fundraiser_id = ${fundraiserId} AND lower(slug) = ${slug.toLowerCase()} LIMIT 1`) as unknown as unknown[];
  return rows.length > 0;
}
