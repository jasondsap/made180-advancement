"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { findConstituentByEmail, getConstituentById } from "@/repositories/constituents";
import { createPledge, applyPledgePayment, getPledgeById, setPledgeStatus } from "@/repositories/pledges";
import { getCampaignById } from "@/repositories/campaigns";
import { getFundById } from "@/repositories/funds";
import { getOrgById } from "@/repositories/orgs";
import { sendTransactionalEmail } from "@/lib/email";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const cents = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createPledgeAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const key = str(fd, "donor");
  const con = UUID_RE.test(key) ? await getConstituentById(ctx.orgId, key) : await findConstituentByEmail(ctx.orgId, key);
  const fundId = str(fd, "fundId") || null;
  const campaignId = str(fd, "campaignId") || null;
  let msg = "created";
  if (!con) msg = "donor_notfound";
  else if (cents(str(fd, "total")) < 1) msg = "bad_amount";
  else if (fundId && !(await getFundById(ctx.orgId, fundId))) msg = "bad_fund";
  else if (campaignId && !(await getCampaignById(ctx.orgId, campaignId))) msg = "bad_campaign";
  else {
    await createPledge(ctx.orgId, {
      constituentId: con.id,
      fundId,
      campaignId,
      totalCents: cents(str(fd, "total")),
      schedule: str(fd, "schedule") || null,
      startsOn: str(fd, "startsOn") || null,
    });
  }
  revalidatePath("/app/pledges");
  redirect(`/app/pledges?msg=${msg}`);
}

export async function applyPaymentAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const pledgeId = str(fd, "pledgeId");
  const amount = cents(str(fd, "amount"));
  const paidOnRaw = str(fd, "paidOn");
  // Derive constituent + fund + campaign from the pledge itself (validated
  // against the org); never trust client-supplied ids.
  const pledge = await getPledgeById(ctx.orgId, pledgeId);
  let msg = "paid";
  if (!pledge) msg = "pledge_notfound";
  else if (amount < 1) msg = "bad_amount";
  else {
    await applyPledgePayment(ctx.orgId, {
      pledgeId: pledge.id,
      constituentId: pledge.constituent_id,
      fundId: pledge.fund_id,
      campaignId: pledge.campaign_id,
      amountCents: amount,
      // Back-dating supported: a check received last week books on its date.
      receivedAt: paidOnRaw ? new Date(paidOnRaw) : new Date(),
    });
  }
  revalidatePath("/app/pledges");
  redirect(`/app/pledges?msg=${msg}`);
}

/** Write off an uncollectable pledge so Outstanding stops counting it. Admin only. */
export async function writeOffPledgeAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  const id = str(fd, "pledgeId");
  const reopen = str(fd, "to") === "open";
  await setPledgeStatus(ctx.orgId, id, reopen ? "open" : "written_off");
  revalidatePath("/app/pledges");
  redirect(`/app/pledges?msg=${reopen ? "reopened" : "written_off"}`);
}

/** Email the donor a friendly balance reminder. Admin only; respects opt-outs. */
export async function sendPledgeReminderAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  const id = str(fd, "pledgeId");

  let msg = "reminded";
  const pledge = await getPledgeById(ctx.orgId, id);
  const con = pledge ? await getConstituentById(ctx.orgId, pledge.constituent_id) : undefined;
  const org = await getOrgById(ctx.orgId);
  if (!pledge || pledge.status !== "open") msg = "pledge_notfound";
  else if (!con?.email || con.do_not_contact) msg = "no_email";
  else if (!org) msg = "pledge_notfound";
  else {
    const name = [con.first_name, con.last_name].filter(Boolean).join(" ") || "Friend";
    const balance = (pledge.balance_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const total = (pledge.total_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    try {
      await sendTransactionalEmail({
        fromName: org.legal_name,
        fromEmail: org.receipt_from_email,
        to: con.email,
        subject: `A friendly reminder about your pledge to ${org.legal_name}`,
        html: `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2B2620;line-height:1.6">
          <p>Dear ${escapeHtml(name)},</p>
          <p>Thank you again for your generous pledge of <strong>${total}</strong> to
             ${escapeHtml(org.legal_name)}. This is a friendly reminder that
             <strong>${balance}</strong> remains outstanding.</p>
          <p>If you've already sent your gift, please disregard this note — and thank you!</p>
          <p>With gratitude,<br/>${escapeHtml(org.legal_name)}</p>
        </div>`,
      });
    } catch (e) {
      console.error("[pledges] reminder failed", e);
      msg = "remind_error";
    }
  }
  revalidatePath("/app/pledges");
  redirect(`/app/pledges?msg=${msg}`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
