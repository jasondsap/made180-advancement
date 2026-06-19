import { cookies } from "next/headers";
import { verifyIdToken, type IdClaims } from "@/lib/cognito";
import { SESSION_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/authConstants";
import {
  getUserByCognitoSub,
  getUserByEmail,
  reconcileCognitoSub,
  createUserFromCognito,
  listMembershipsForUser,
} from "@/repositories/users";
import { getOrgBySlug } from "@/repositories/orgs";
import type { MembershipRole } from "@/types/db";

export type Role = "super_admin" | MembershipRole;

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  memberships: { orgId: string; role: MembershipRole }[];
}

/** The default org a super_admin lands on when they have no membership. */
const DEFAULT_ORG_SLUG = "nvre";

async function getClaims(): Promise<IdClaims | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyIdToken(token);
  } catch {
    return null; // expired/invalid → treated as logged out
  }
}

/**
 * Resolve the authenticated user from the session cookie. Reconciles the seeded
 * super_admin row to its Cognito sub on first login; auto-provisions a bare
 * (access-less) user otherwise.
 */
export async function getAppUser(): Promise<AppUser | null> {
  const claims = await getClaims();
  if (!claims) return null;

  let user = await getUserByCognitoSub(claims.sub);
  if (!user && claims.email) {
    const seeded = await getUserByEmail(claims.email);
    if (seeded) user = await reconcileCognitoSub(seeded.id, claims.sub);
  }
  if (!user) {
    user = await createUserFromCognito(claims.sub, claims.email, claims.name ?? null);
  }

  const memberships = await listMembershipsForUser(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.is_super_admin,
    memberships: memberships.map((m) => ({ orgId: m.org_id, role: m.role })),
  };
}

export function canAccessOrg(user: AppUser, orgId: string): boolean {
  return user.isSuperAdmin || user.memberships.some((m) => m.orgId === orgId);
}

/** Effective role within an org, or null if no access. */
export function roleFor(user: AppUser, orgId: string): Role | null {
  if (user.isSuperAdmin) return "super_admin";
  const m = user.memberships.find((mm) => mm.orgId === orgId);
  return m ? m.role : null;
}

/**
 * The org the user is currently acting within: the cookie selection if allowed,
 * else their first membership, else (super_admin) the default org.
 */
export async function resolveActiveOrgId(user: AppUser): Promise<string | null> {
  const jar = await cookies();
  const cookieOrg = jar.get(ACTIVE_ORG_COOKIE)?.value;
  if (cookieOrg && canAccessOrg(user, cookieOrg)) return cookieOrg;
  if (user.memberships[0]) return user.memberships[0].orgId;
  if (user.isSuperAdmin) {
    const org = await getOrgBySlug(DEFAULT_ORG_SLUG);
    return org?.id ?? null;
  }
  return null;
}

/** Convenience for server components/actions: the user + their active org + role. */
export interface AuthContext {
  user: AppUser;
  orgId: string;
  role: Role;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getAppUser();
  if (!user) return null;
  const orgId = await resolveActiveOrgId(user);
  if (!orgId) return null; // authenticated but no org access
  const role = roleFor(user, orgId);
  if (!role) return null;
  return { user, orgId, role };
}

/** True if the role may write settings/CRUD (org_admin or super_admin). */
export function canManage(role: Role): boolean {
  return role === "super_admin" || role === "org_admin";
}
