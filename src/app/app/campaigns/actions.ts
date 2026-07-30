"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { createCampaign, updateCampaign, getCampaignById, CAMPAIGN_CATEGORIES } from "@/repositories/campaigns";
import { createAppeal, updateAppeal, deleteAppeal } from "@/repositories/appeals";
import { resolveCampaignSegment, CAMPAIGN_SEGMENTS, type CampaignSegmentKey } from "@/repositories/campaignSegments";
import { createMessage, setMessageAppeal } from "@/repositories/engage/messages";
import { getOrgById } from "@/repositories/orgs";
import { sendEmailMessage } from "@/domain/engage/send";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const dollarsToCents = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** Normalize a user-entered public slug: lowercase, hyphens, alnum only. */
const slugify = (v: string): string | null => {
  const s = v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || null;
};

const category = (fd: FormData): string | null => {
  const c = str(fd, "category");
  return (CAMPAIGN_CATEGORIES as readonly string[]).includes(c) ? c : null;
};

async function requireManager() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  return ctx;
}

function campaignFields(fd: FormData) {
  return {
    name: str(fd, "name"),
    goalCents: str(fd, "goal") ? dollarsToCents(str(fd, "goal")) : null,
    startsOn: str(fd, "startsOn") || null,
    endsOn: str(fd, "endsOn") || null,
    description: str(fd, "description") || null,
    category: category(fd),
    coverImageUrl: str(fd, "coverImageUrl") || null,
    publicSlug: str(fd, "publicSlug") ? slugify(str(fd, "publicSlug")) : null,
  };
}

export async function createCampaignAction(fd: FormData) {
  const ctx = await requireManager();
  let id: string | null = null;
  if (str(fd, "name")) {
    const c = await createCampaign(ctx.orgId, campaignFields(fd));
    id = c.id;
  }
  revalidatePath("/app/campaigns");
  redirect(id ? `/app/campaigns/${id}` : "/app/campaigns");
}

export async function updateCampaignAction(fd: FormData) {
  const ctx = await requireManager();
  const id = str(fd, "id");
  await updateCampaign(ctx.orgId, id, {
    ...campaignFields(fd),
    active: fd.get("active") === "on",
  });
  revalidatePath("/app/campaigns");
  revalidatePath(`/app/campaigns/${id}`);
  redirect(`/app/campaigns/${id}?msg=saved`);
}

export async function createAppealAction(fd: FormData) {
  const ctx = await requireManager();
  const campaignId = str(fd, "campaignId") || null;
  if (str(fd, "name")) {
    await createAppeal(ctx.orgId, {
      name: str(fd, "name"),
      campaignId,
      channel: str(fd, "channel") || null,
      askAmountCents: str(fd, "askAmount") ? dollarsToCents(str(fd, "askAmount")) : null,
      sentOn: str(fd, "sentOn") || null,
    });
  }
  const dest = campaignId ? `/app/campaigns/${campaignId}/appeals` : "/app/campaigns";
  revalidatePath(dest);
  redirect(dest);
}

export async function updateAppealAction(fd: FormData) {
  const ctx = await requireManager();
  await updateAppeal(ctx.orgId, str(fd, "id"), {
    name: str(fd, "name"),
    channel: str(fd, "channel") || null,
    askAmountCents: str(fd, "askAmount") ? dollarsToCents(str(fd, "askAmount")) : null,
    sentOn: str(fd, "sentOn") || null,
  });
  const dest = str(fd, "campaignId") ? `/app/campaigns/${str(fd, "campaignId")}/appeals` : "/app/campaigns";
  revalidatePath(dest);
  redirect(dest);
}

/**
 * The Asks commit step: resolve the segment, create the appeal (only now, so
 * abandoned drafts never orphan appeal rows), substitute the tracking link for
 * {{appeal_link}}, create + send the Interactions email, and link message → appeal.
 */
export async function sendAppealAskAction(fd: FormData) {
  const ctx = await requireManager();
  const campaignId = str(fd, "campaignId");
  const segmentKey = str(fd, "segmentKey") as CampaignSegmentKey;
  const appealName = str(fd, "appealName");
  const subject = str(fd, "subject");
  const body = String(fd.get("body") ?? "").trim();
  if (!campaignId || !(segmentKey in CAMPAIGN_SEGMENTS)) throw new Error("missing campaign/segment");
  if (!appealName || !subject || !body) throw new Error("appeal name, subject, and body are required");

  const campaign = await getCampaignById(ctx.orgId, campaignId);
  if (!campaign) throw new Error("campaign not found");
  const constituentIds = await resolveCampaignSegment(ctx.orgId, campaign, segmentKey);
  if (constituentIds.length === 0) throw new Error("segment matched no constituents");

  const appeal = await createAppeal(ctx.orgId, {
    name: appealName,
    campaignId: campaign.id,
    channel: "email",
    askAmountCents: str(fd, "askAmount") ? dollarsToCents(str(fd, "askAmount")) : null,
    sentOn: new Date().toISOString().slice(0, 10),
  });

  const org = await getOrgById(ctx.orgId);
  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const appealLink = `${base}/give/${org?.slug}?appeal=${appeal.id}`;
  const sub = (s: string) => s.replaceAll("{{appeal_link}}", appealLink);

  const msg = await createMessage(ctx.orgId, {
    channel: "email",
    name: appealName,
    subject: sub(subject),
    bodyMd: sub(body),
    audience: { mode: "manual", constituentIds },
    createdBy: ctx.user.id,
  });
  await setMessageAppeal(ctx.orgId, msg.id, appeal.id);
  await sendEmailMessage(ctx.orgId, msg.id);

  revalidatePath(`/app/campaigns/${campaign.id}`);
  redirect(`/app/campaigns/${campaign.id}/appeals?msg=sent`);
}

export async function deleteAppealAction(fd: FormData) {
  const ctx = await requireManager();
  await deleteAppeal(ctx.orgId, str(fd, "id"));
  const dest = str(fd, "campaignId") ? `/app/campaigns/${str(fd, "campaignId")}/appeals` : "/app/campaigns";
  revalidatePath(dest);
  redirect(dest);
}
