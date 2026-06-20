import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { MembershipRole } from "@/types/db";

/**
 * Identity repository: users + memberships.
 *
 * Not orgId-first — users span orgs (a super_admin belongs to none, a staffer
 * may belong to several). Org scoping happens through memberships. This is the
 * same documented exception as the orgs resolver.
 */
export interface UserRow {
  id: string;
  cognito_sub: string;
  email: string;
  name: string | null;
  is_super_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MembershipRow {
  id: string;
  org_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: Date;
}

export async function getUserByCognitoSub(sub: string): Promise<UserRow | undefined> {
  const rows = (await sql`SELECT * FROM users WHERE cognito_sub = ${sub} LIMIT 1`) as unknown as UserRow[];
  return rows[0];
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = (await sql`
    SELECT * FROM users WHERE lower(email) = ${email.trim().toLowerCase()} LIMIT 1
  `) as unknown as UserRow[];
  return rows[0];
}

/** Bind a seeded/pending user row to the real Cognito sub on first login. */
export async function reconcileCognitoSub(userId: string, sub: string): Promise<UserRow> {
  const rows = (await sql`
    UPDATE users SET cognito_sub = ${sub} WHERE id = ${userId} RETURNING *
  `) as unknown as UserRow[];
  const row = rows[0];
  if (!row) throw new Error(`reconcileCognitoSub: user ${userId} not found`);
  return row;
}

/** Provision a bare user on first login (no memberships → no access until granted). */
export async function createUserFromCognito(
  sub: string,
  email: string,
  name: string | null,
): Promise<UserRow> {
  const rows = (await sql`
    INSERT INTO users (cognito_sub, email, name, is_super_admin)
    VALUES (${sub}, ${email}, ${name}, false)
    ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email
    RETURNING *
  `) as unknown as UserRow[];
  const row = rows[0];
  if (!row) throw new Error("createUserFromCognito returned no row");
  return row;
}

export async function listMembershipsForUser(userId: string): Promise<MembershipRow[]> {
  return (await sql`
    SELECT * FROM memberships WHERE user_id = ${userId} ORDER BY created_at
  `) as unknown as MembershipRow[];
}

// ---------------------------------------------------------------------------
// Membership management (super_admin console). orgId-first + assertOrgId, the
// same contract as every other org-scoped repository function.
// ---------------------------------------------------------------------------

export interface OrgMemberRow {
  user_id: string;
  email: string;
  name: string | null;
  is_super_admin: boolean;
  role: MembershipRole;
  member_since: Date;
}

/** All users with a membership in this org, joined with their identity. */
export async function listMembersForOrg(orgId: string): Promise<OrgMemberRow[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT u.id AS user_id, u.email, u.name, u.is_super_admin,
           m.role, m.created_at AS member_since
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ${orgId}
    ORDER BY m.created_at
  `) as unknown as OrgMemberRow[];
}

/**
 * Resolve a user by email, pre-provisioning a seed-pending row if none exists.
 * Mirrors the super_admin seed: cognito_sub is a `seed-pending:` sentinel until
 * the person's first Cognito login, which the auth layer reconciles by email.
 * This lets an admin grant access before the user has ever signed in.
 */
export async function getOrCreateUserByEmail(email: string, name: string | null): Promise<UserRow> {
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  const clean = email.trim();
  const sub = `seed-pending:${clean.toLowerCase()}`;
  const rows = (await sql`
    INSERT INTO users (cognito_sub, email, name, is_super_admin)
    VALUES (${sub}, ${clean}, ${name}, false)
    ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email
    RETURNING *
  `) as unknown as UserRow[];
  return rows[0]!;
}

/** Grant (or update) a user's role within an org. Idempotent on (org, user). */
export async function addMembership(orgId: string, userId: string, role: MembershipRole): Promise<void> {
  assertOrgId(orgId);
  await sql`
    INSERT INTO memberships (org_id, user_id, role)
    VALUES (${orgId}, ${userId}, ${role})
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
  `;
}

export async function updateMembershipRole(orgId: string, userId: string, role: MembershipRole): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE memberships SET role = ${role} WHERE org_id = ${orgId} AND user_id = ${userId}
  `;
}

export async function removeMembership(orgId: string, userId: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM memberships WHERE org_id = ${orgId} AND user_id = ${userId}`;
}
