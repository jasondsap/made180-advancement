import { sql } from "@/lib/db";
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
