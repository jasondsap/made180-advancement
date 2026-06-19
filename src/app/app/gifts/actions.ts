"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { upsertConstituentByEmail, createConstituent } from "@/repositories/constituents";
import { insertGift, getGiftById, markRefunded } from "@/repositories/gifts";
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

    const benefitDollars = parseFloat(str(formData, "benefitFmv"));
    const benefitFmvCents = Number.isFinite(benefitDollars) && benefitDollars > 0 ? Math.round(benefitDollars * 100) : null;
    const { gift } = await insertGift(orgId, {
      constituentId,
      fundId,
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
