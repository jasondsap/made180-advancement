"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE } from "@/lib/authConstants";
import { getAppUser, canAccessOrg } from "@/lib/auth";

/**
 * Set the active org for the session (org switcher). Validates the user may
 * access the target org before trusting it — this is the one place a client
 * value influences org resolution, so the guard is mandatory.
 */
export async function setActiveOrgAction(fd: FormData) {
  const orgId = String(fd.get("orgId") ?? "").trim();
  const user = await getAppUser();
  if (!user || !canAccessOrg(user, orgId)) throw new Error("forbidden");
  const jar = await cookies();
  jar.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/app/dashboard");
}
