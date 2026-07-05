"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { upsertConstituentByEmail, createConstituent, findConstituentByEmail, getConstituentById } from "@/repositories/constituents";
import { insertGift, getGiftById, markRefunded, updateGift, voidGift } from "@/repositories/gifts";
import { getAppealById } from "@/repositories/appeals";
import { getFundById } from "@/repositories/funds";
import { getCampaignById } from "@/repositories/campaigns";
import { issueReceipt } from "@/domain/receipts";
import { getStripe } from "@/lib/stripe";
import type { GiftType, GiftStatus, AddressJson } from "@/types/db";

const MANUAL_TYPES: GiftType[] = ["one_time", "check", "in_kind", "matching", "stock", "pledge", "recurring"];
const STATUSES: GiftStatus[] = ["succeeded", "pending", "failed", "refunded"];

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

/** Manual gift entry (checks, in-kind, matching, stock, ...). Any role may enter gifts. */
export async function createManualGift(formData: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const orgId = ctx.orgId;

  const giftType = (str(formData, "giftType") as GiftType) || "check";
  if (!MANUAL_TYPES.includes(giftType)) throw new Error("invalid gift type");
  const status = (str(formData, "status") as GiftStatus) || "succeeded";
  if (!STATUSES.includes(status)) throw new Error("invalid status");

  const dollars = parseFloat(str(formData, "amount"));
  const amountCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;

  const email = str(formData, "email");
  const firstName = str(formData, "firstName") || null;
  const lastName = str(formData, "lastName") || null;
  const orgName = str(formData, "orgName") || null;
  const fundId = str(formData, "fundId") || null;
  const appealId = str(formData, "appealId") || null;
  let campaignId = str(formData, "campaignId") || null;
  const notes = str(formData, "notes") || null;
  const receivedAtRaw = str(formData, "receivedAt");
  const sendReceipt = formData.get("sendReceipt") === "on";

  let result: { giftId?: string; error?: string } = {};
  try {
    if (amountCents < 1 && giftType !== "in_kind") throw new Error("Amount must be at least $0.01");
    if (!email && !firstName && !lastName && !orgName) throw new Error("Enter a donor name or email");

    const address: AddressJson | null = null;
    let constituentId: string;
    if (email) {
      const { constituent } = await upsertConstituentByEmail(orgId, {
        email, firstName, lastName, orgName, address, source: "manual",
      });
      constituentId = constituent.id;
    } else {
      const con = await createConstituent(orgId, { firstName, lastName, orgName, source: "manual" });
      constituentId = con.id;
    }

    // Attribution: an appeal implies its campaign when none was chosen
    // (mirrors the checkout rule). Fund/campaign ids are validated against the
    // org before insert (previously trusted from the client unverified).
    if (appealId) {
      const appeal = await getAppealById(orgId, appealId);
      if (!appeal) throw new Error("invalid appeal");
      if (!campaignId) campaignId = appeal.campaign_id;
    }
    if (fundId && !(await getFundById(orgId, fundId))) throw new Error("invalid fund");
    if (campaignId && !(await getCampaignById(orgId, campaignId))) throw new Error("invalid campaign");

    const benefitDollars = parseFloat(str(formData, "benefitFmv"));
    const benefitFmvCents = Number.isFinite(benefitDollars) && benefitDollars > 0 ? Math.round(benefitDollars * 100) : null;
    const { gift } = await insertGift(orgId, {
      constituentId,
      fundId,
      campaignId,
      appealId,
      giftType,
      amountCents,
      status,
      receivedAt: receivedAtRaw ? new Date(receivedAtRaw) : new Date(),
      benefitFmvCents,
      benefitDescription: benefitFmvCents ? (str(formData, "benefitDescription") || "Goods or services") : null,
      notes,
    });
    result.giftId = gift.id;

    if (sendReceipt && email && status === "succeeded") {
      try {
        await issueReceipt(orgId, gift.id);
      } catch (e) {
        console.error("[gifts] manual receipt failed (gift saved)", e);
      }
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : "Could not record gift";
  }

  if (result.error) {
    redirect(`/app/gifts/new?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/app/gifts");
  redirect(`/app/gifts/${result.giftId}?msg=created`);
}

/**
 * Edit a gift's attribution (always) and money/date/type (manual gifts only —
 * the repository enforces the Stripe lock). Admin only. Soft credit accepts a
 * constituent email or UUID, resolved + validated against the org.
 */
export async function updateGiftAction(formData: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  const giftId = str(formData, "giftId");

  // Resolve soft credit: blank clears; else email or UUID must match someone.
  const softKey = str(formData, "softCredit");
  let softCreditId: string | null = null;
  if (softKey) {
    const con = /^[0-9a-f-]{36}$/i.test(softKey)
      ? await getConstituentById(ctx.orgId, softKey)
      : await findConstituentByEmail(ctx.orgId, softKey);
    if (!con) redirect(`/app/gifts/${giftId}/edit?error=${encodeURIComponent("Soft-credit constituent not found")}`);
    softCreditId = con!.id;
  }

  // Validate attribution ids against the org (asymmetric-trust fix: fund and
  // campaign were previously inserted unverified).
  const fundId = str(formData, "fundId") || null;
  const campaignId = str(formData, "campaignId") || null;
  const appealId = str(formData, "appealId") || null;
  if (appealId && !(await getAppealById(ctx.orgId, appealId))) throw new Error("invalid appeal");
  if (fundId && !(await getFundById(ctx.orgId, fundId))) throw new Error("invalid fund");
  if (campaignId && !(await getCampaignById(ctx.orgId, campaignId))) throw new Error("invalid campaign");

  const dollars = parseFloat(str(formData, "amount"));
  const receivedAtRaw = str(formData, "receivedAt");
  const giftType = str(formData, "giftType");

  await updateGift(ctx.orgId, giftId, {
    fundId,
    campaignId,
    appealId,
    isAnonymous: formData.get("isAnonymous") === "on",
    softCreditId,
    notes: str(formData, "notes") || null,
    amountCents: Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : undefined,
    receivedAt: receivedAtRaw ? new Date(receivedAtRaw) : undefined,
    giftType: giftType && MANUAL_TYPES.includes(giftType as GiftType) ? giftType : undefined,
  });
  revalidatePath(`/app/gifts/${giftId}`);
  revalidatePath("/app/gifts");
  redirect(`/app/gifts/${giftId}?msg=saved`);
}

/** Void a manually-entered gift (data-entry mistake). Admin only; Stripe gifts refuse. */
export async function voidGiftAction(formData: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  const giftId = str(formData, "giftId");
  const voided = await voidGift(ctx.orgId, giftId);
  revalidatePath(`/app/gifts/${giftId}`);
  revalidatePath("/app/gifts");
  redirect(`/app/gifts/${giftId}?msg=${voided ? "voided" : "void_error"}`);
}

/** Refund a gift. Sensitive — org_admin/super_admin only. Issues a Stripe refund when applicable. */
export async function refundGift(formData: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  const giftId = str(formData, "giftId");

  let msg = "refunded";
  try {
    const gift = await getGiftById(ctx.orgId, giftId);
    if (!gift) throw new Error("not_found");
    if (gift.status === "refunded") {
      msg = "already_refunded";
    } else {
      if (gift.stripe_payment_intent_id) {
        await getStripe().refunds.create({ payment_intent: gift.stripe_payment_intent_id });
      }
      await markRefunded(ctx.orgId, giftId);
    }
  } catch (e) {
    console.error("[gifts] refund failed", e);
    msg = "refund_error";
  }
  revalidatePath(`/app/gifts/${giftId}`);
  revalidatePath("/app/gifts");
  redirect(`/app/gifts/${giftId}?msg=${msg}`);
}

/** Resend (or first-time generate) the receipt for a gift. Reuses the existing number. */
export async function resendReceipt(formData: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const giftId = str(formData, "giftId");

  let msg = "receipt_sent";
  try {
    await issueReceipt(ctx.orgId, giftId);
  } catch (e) {
    console.error("[gifts] resend receipt failed", e);
    msg = "receipt_error";
  }
  revalidatePath(`/app/gifts/${giftId}`);
  redirect(`/app/gifts/${giftId}?msg=${msg}`);
}
