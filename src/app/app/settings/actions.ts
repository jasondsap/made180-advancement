"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { createFund, updateFund } from "@/repositories/funds";
import { createCampaign, updateCampaign } from "@/repositories/campaigns";
import { createAppeal } from "@/repositories/appeals";
import { updateOrgSettings } from "@/repositories/orgs";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const dollarsToCents = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

async function requireManager() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  return ctx;
}

export async function createFundAction(fd: FormData) {
  const ctx = await requireManager();
  if (str(fd, "code") && str(fd, "name")) {
    await createFund(ctx.orgId, { code: str(fd, "code"), name: str(fd, "name"), restricted: fd.get("restricted") === "on" });
  }
  revalidatePath("/app/funds");
  redirect("/app/funds");
}

export async function updateFundAction(fd: FormData) {
  const ctx = await requireManager();
  await updateFund(ctx.orgId, str(fd, "id"), {
    name: str(fd, "name"),
    restricted: fd.get("restricted") === "on",
    active: fd.get("active") === "on",
  });
  revalidatePath("/app/funds");
  redirect("/app/funds");
}

export async function createCampaignAction(fd: FormData) {
  const ctx = await requireManager();
  if (str(fd, "name")) {
    await createCampaign(ctx.orgId, {
      name: str(fd, "name"),
      goalCents: str(fd, "goal") ? dollarsToCents(str(fd, "goal")) : null,
      startsOn: str(fd, "startsOn") || null,
      endsOn: str(fd, "endsOn") || null,
    });
  }
  revalidatePath("/app/campaigns");
  redirect("/app/campaigns");
}

export async function updateCampaignAction(fd: FormData) {
  const ctx = await requireManager();
  await updateCampaign(ctx.orgId, str(fd, "id"), {
    name: str(fd, "name"),
    goalCents: str(fd, "goal") ? dollarsToCents(str(fd, "goal")) : null,
    active: fd.get("active") === "on",
  });
  revalidatePath("/app/campaigns");
  redirect("/app/campaigns");
}

export async function createAppealAction(fd: FormData) {
  const ctx = await requireManager();
  if (str(fd, "name")) {
    await createAppeal(ctx.orgId, {
      name: str(fd, "name"),
      campaignId: str(fd, "campaignId") || null,
      channel: str(fd, "channel") || null,
    });
  }
  revalidatePath("/app/campaigns");
  redirect("/app/campaigns");
}

export async function updateOrgAction(fd: FormData) {
  const ctx = await requireManager();
  const address = {
    line1: str(fd, "line1") || undefined,
    line2: str(fd, "line2") || undefined,
    city: str(fd, "city") || undefined,
    state: str(fd, "state") || undefined,
    zip: str(fd, "zip") || undefined,
  };
  await updateOrgSettings(ctx.orgId, {
    legalName: str(fd, "legalName"),
    ein: str(fd, "ein") || null,
    receiptFromEmail: str(fd, "receiptFromEmail") || null,
    receiptSignatureName: str(fd, "receiptSignatureName") || null,
    address: address.line1 || address.city ? address : null,
    logoUrl: str(fd, "logoUrl") || null,
    primaryColor: str(fd, "primaryColor") || null,
  });
  revalidatePath("/app/settings");
  redirect("/app/settings?msg=saved");
}
