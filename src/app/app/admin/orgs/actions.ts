"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createOrg, getOrgById, setStripeAccountId, updateOrgSettings } from "@/repositories/orgs";
import {
  getOrCreateUserByEmail,
  addMembership,
  updateMembershipRole,
  removeMembership,
} from "@/repositories/users";
import { getStripe } from "@/lib/stripe";
import { requireEnv } from "@/lib/env";
import type { MembershipRole } from "@/types/db";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
const asRole = (v: string): MembershipRole => (v === "org_admin" ? "org_admin" : "org_staff");

export async function createOrgAction(fd: FormData) {
  await requireSuperAdmin();
  const legalName = str(fd, "legalName");
  if (!legalName) throw new Error("Legal name is required");
  const slug = slugify(str(fd, "slug") || legalName);
  if (!slug) throw new Error("Could not derive a slug from the name");
  const org = await createOrg({
    slug,
    legalName,
    ein: str(fd, "ein") || null,
    receiptFromEmail: str(fd, "receiptFromEmail") || null,
    receiptSignatureName: str(fd, "receiptSignatureName") || null,
  });
  revalidatePath("/app/admin/orgs");
  redirect(`/app/admin/orgs/${org.id}?msg=created`);
}

export async function updateOrgCoreAction(fd: FormData) {
  await requireSuperAdmin();
  const orgId = str(fd, "orgId");
  const address = {
    line1: str(fd, "line1") || undefined,
    line2: str(fd, "line2") || undefined,
    city: str(fd, "city") || undefined,
    state: str(fd, "state") || undefined,
    zip: str(fd, "zip") || undefined,
  };
  await updateOrgSettings(orgId, {
    legalName: str(fd, "legalName"),
    ein: str(fd, "ein") || null,
    receiptFromEmail: str(fd, "receiptFromEmail") || null,
    receiptSignatureName: str(fd, "receiptSignatureName") || null,
    address: address.line1 || address.city ? address : null,
  });
  revalidatePath(`/app/admin/orgs/${orgId}`);
  redirect(`/app/admin/orgs/${orgId}?msg=saved`);
}

export async function addMemberAction(fd: FormData) {
  await requireSuperAdmin();
  const orgId = str(fd, "orgId");
  const email = str(fd, "email");
  if (email) {
    const user = await getOrCreateUserByEmail(email, null);
    await addMembership(orgId, user.id, asRole(str(fd, "role")));
  }
  revalidatePath(`/app/admin/orgs/${orgId}`);
  redirect(`/app/admin/orgs/${orgId}?msg=member`);
}

export async function changeRoleAction(fd: FormData) {
  await requireSuperAdmin();
  const orgId = str(fd, "orgId");
  await updateMembershipRole(orgId, str(fd, "userId"), asRole(str(fd, "role")));
  revalidatePath(`/app/admin/orgs/${orgId}`);
  redirect(`/app/admin/orgs/${orgId}`);
}

export async function removeMemberAction(fd: FormData) {
  await requireSuperAdmin();
  const orgId = str(fd, "orgId");
  await removeMembership(orgId, str(fd, "userId"));
  revalidatePath(`/app/admin/orgs/${orgId}`);
  redirect(`/app/admin/orgs/${orgId}`);
}

/**
 * Create the org's Stripe Connect (Express) account if needed, then send the
 * admin to Stripe's hosted onboarding via an account link. On return Stripe
 * bounces back to the org page where charges_enabled is re-checked.
 */
export async function startStripeOnboardingAction(fd: FormData) {
  await requireSuperAdmin();
  const orgId = str(fd, "orgId");
  const org = await getOrgById(orgId);
  if (!org) throw new Error("Organization not found");

  const stripe = getStripe();
  let acctId = org.stripe_account_id;
  if (!acctId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { org_id: org.id, org_slug: org.slug },
    });
    acctId = account.id;
    await setStripeAccountId(org.id, acctId);
  }

  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const link = await stripe.accountLinks.create({
    account: acctId,
    refresh_url: `${base}/app/admin/orgs/${org.id}?stripe=refresh`,
    return_url: `${base}/app/admin/orgs/${org.id}?stripe=return`,
    type: "account_onboarding",
  });
  redirect(link.url);
}
