import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { env } from "@/lib/env";
import { getAuthOptions } from "@/lib/auth-options";
import { ACTIVE_ORG_COOKIE } from "@/lib/authConstants";
import {
  getUserByCognitoSub,
  getUserByEmail,
  reconcileCognitoSub,
  createUserFromCognito,
  listMembershipsForUser,
} from "@/repositories/users";
import { listAllOrgs, listOrgsByIds } from "@/repositories/orgs";
import type { MembershipRole, Org } from "@/types/db";

export type Role = "super_admin" | MembershipRole;

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  memberships: { orgId: string; role: MembershipRole }[];
}

/**
 * Resolve the authenticated user from the NextAuth session. The signIn callback
 * already reconciled/created the users row, but we defensively re-reconcile here
 * (seeded super_admin matched by email) so this works even on the first request.
 */
export async function getAppUser(): Promise<AppUser | null> {
  // If auth isn't configured (e.g. during `next build`), treat as unauthenticated
  // rather than throwing — keeps the build green; runtime has the vars.
  if (!env().NEXTAUTH_SECRET || !env().COGNITO_CLIENT_ID) return null;
  const session = await getServerSession(getAuthOptions());
  const sub = (session?.user as { id?: string } | undefined)?.id;
  if (!sub) return null;
  const email = session?.user?.email ?? "";
  const name = session?.user?.name ?? null;

  let user = await getUserByCognitoSub(sub);
  if (!user && email) {
    const seeded = await getUserByEmail(email);
    if (seeded) user = await reconcileCognitoSub(seeded.id, sub);
  }
  if (!user) user = await createUserFromCognito(sub, email, name);

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

export function roleFor(user: AppUser, orgId: string): Role | null {
  if (user.isSuperAdmin) return "super_admin";
  const m = user.memberships.find((mm) => mm.orgId === orgId);
  return m ? m.role : null;
}

export async function resolveActiveOrgId(user: AppUser): Promise<string | null> {
  const jar = await cookies();
  const cookieOrg = jar.get(ACTIVE_ORG_COOKIE)?.value;
  if (cookieOrg && canAccessOrg(user, cookieOrg)) return cookieOrg;
  if (user.memberships[0]) return user.memberships[0].orgId;
  if (user.isSuperAdmin) {
    // No selected org and no membership → land on the first org (alphabetical).
    // The header org switcher lets them change it; null only if no orgs exist.
    const [first] = await listAllOrgs();
    return first?.id ?? null;
  }
  return null;
}

/** Orgs this user may switch between: every org for a super_admin, else their memberships. */
export async function listAccessibleOrgs(user: AppUser): Promise<Org[]> {
  if (user.isSuperAdmin) return listAllOrgs();
  return listOrgsByIds(user.memberships.map((m) => m.orgId));
}

export interface AuthContext {
  user: AppUser;
  orgId: string;
  role: Role;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getAppUser();
  if (!user) return null;
  const orgId = await resolveActiveOrgId(user);
  if (!orgId) return null;
  const role = roleFor(user, orgId);
  if (!role) return null;
  return { user, orgId, role };
}

export function canManage(role: Role): boolean {
  return role === "super_admin" || role === "org_admin";
}

/** Gate for the platform (cross-org) console. Throws unless the caller is super_admin. */
export async function requireSuperAdmin(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user || !user.isSuperAdmin) throw new Error("forbidden: super_admin required");
  return user;
}
