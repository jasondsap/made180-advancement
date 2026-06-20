"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import {
  createFundraiser,
  updateFundraiser,
  setFundraiserStatus,
  setFundraiserPinned,
  setFundraiserPayments,
  duplicateFundraiser,
  slugExists,
} from "@/repositories/fundraisers";
import { createTicketType, updateTicketType, deleteTicketType } from "@/repositories/ticketTypes";
import type { FundraiserType, FundraiserFeature, FundraiserTheme } from "@/types/db";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const centsOrNull = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

async function requireManager() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden: Fundraisers require an admin role");
  return ctx;
}

/** Derive a slug from a title, ensuring it's unique within the org. */
async function uniqueSlug(orgId: string, title: string): Promise<string> {
  const base = slugify(title) || "fundraiser";
  let slug = base;
  let n = 1;
  while (await slugExists(orgId, slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export async function createFundraiserAction(fd: FormData) {
  const ctx = await requireManager();
  const type = (["donation_form", "fundraising_page", "event"].includes(str(fd, "type")) ? str(fd, "type") : "donation_form") as FundraiserType;
  const title = str(fd, "title") || "Untitled fundraiser";
  const features = String(fd.get("features") ?? "").split(",").map((s) => s.trim()).filter(Boolean) as FundraiserFeature[];
  const slug = await uniqueSlug(ctx.orgId, title);
  const fr = await createFundraiser(ctx.orgId, { type, title, slug, features });
  revalidatePath("/app/fundraisers");
  redirect(`/app/fundraisers/${fr.id}/edit?msg=created`);
}

export async function updateFundraiserAction(fd: FormData) {
  const ctx = await requireManager();
  const id = str(fd, "id");
  const amounts = String(fd.get("suggestedAmounts") ?? "")
    .split(",")
    .map((s) => centsOrNull(s.trim()))
    .filter((n): n is number => n != null && n > 0);
  const theme: FundraiserTheme = {
    accent: str(fd, "accent") || null,
    coverImageUrl: str(fd, "coverImageUrl") || null,
    story: str(fd, "story") || null,
    suggestedAmounts: amounts.length ? amounts : null,
  };
  await updateFundraiser(ctx.orgId, id, {
    title: str(fd, "title"),
    goalCents: str(fd, "goal") ? centsOrNull(str(fd, "goal")) : null,
    fundId: str(fd, "fundId") || null,
    campaignId: str(fd, "campaignId") || null,
    theme,
  });
  revalidatePath(`/app/fundraisers/${id}/edit`);
  redirect(`/app/fundraisers/${id}/edit?msg=saved`);
}

export async function publishFundraiserAction(fd: FormData) {
  const ctx = await requireManager();
  const id = str(fd, "id");
  await setFundraiserStatus(ctx.orgId, id, str(fd, "publish") === "1" ? "published" : "unpublished");
  revalidatePath(`/app/fundraisers/${id}/edit`);
  redirect(`/app/fundraisers/${id}/edit`);
}

export async function archiveFundraiserAction(fd: FormData) {
  const ctx = await requireManager();
  await setFundraiserStatus(ctx.orgId, str(fd, "id"), "archived");
  revalidatePath("/app/fundraisers");
  redirect("/app/fundraisers");
}

export async function pinFundraiserAction(fd: FormData) {
  const ctx = await requireManager();
  const id = str(fd, "id");
  await setFundraiserPinned(ctx.orgId, id, str(fd, "pinned") === "1");
  revalidatePath("/app/fundraisers");
  redirect("/app/fundraisers");
}

export async function paymentsFundraiserAction(fd: FormData) {
  const ctx = await requireManager();
  const id = str(fd, "id");
  await setFundraiserPayments(ctx.orgId, id, str(fd, "enabled") === "1");
  revalidatePath(`/app/fundraisers/${id}/edit`);
  redirect(`/app/fundraisers/${id}/edit`);
}

export async function duplicateFundraiserAction(fd: FormData) {
  const ctx = await requireManager();
  const copy = await duplicateFundraiser(ctx.orgId, str(fd, "id"));
  revalidatePath("/app/fundraisers");
  redirect(copy ? `/app/fundraisers/${copy.id}/edit` : "/app/fundraisers");
}

// ---------- Ticket types (event fundraisers) ----------

export async function addTicketTypeAction(fd: FormData) {
  const ctx = await requireManager();
  const fundraiserId = str(fd, "fundraiserId");
  if (str(fd, "name")) {
    await createTicketType(ctx.orgId, fundraiserId, {
      name: str(fd, "name"),
      description: str(fd, "description") || null,
      priceCents: centsOrNull(str(fd, "price")) ?? 0,
      capacity: str(fd, "capacity") ? parseInt(str(fd, "capacity"), 10) : null,
    });
  }
  revalidatePath(`/app/fundraisers/${fundraiserId}/edit`);
  redirect(`/app/fundraisers/${fundraiserId}/edit`);
}

export async function updateTicketTypeAction(fd: FormData) {
  const ctx = await requireManager();
  const fundraiserId = str(fd, "fundraiserId");
  await updateTicketType(ctx.orgId, str(fd, "id"), {
    name: str(fd, "name"),
    description: str(fd, "description") || null,
    priceCents: centsOrNull(str(fd, "price")) ?? 0,
    capacity: str(fd, "capacity") ? parseInt(str(fd, "capacity"), 10) : null,
    active: fd.get("active") === "on",
  });
  revalidatePath(`/app/fundraisers/${fundraiserId}/edit`);
  redirect(`/app/fundraisers/${fundraiserId}/edit`);
}

export async function deleteTicketTypeAction(fd: FormData) {
  const ctx = await requireManager();
  const fundraiserId = str(fd, "fundraiserId");
  await deleteTicketType(ctx.orgId, str(fd, "id"));
  revalidatePath(`/app/fundraisers/${fundraiserId}/edit`);
  redirect(`/app/fundraisers/${fundraiserId}/edit`);
}
