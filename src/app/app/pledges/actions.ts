"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { findConstituentByEmail, getConstituentById } from "@/repositories/constituents";
import { createPledge, applyPledgePayment } from "@/repositories/pledges";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const cents = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createPledgeAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const key = str(fd, "donor");
  const con = UUID_RE.test(key) ? await getConstituentById(ctx.orgId, key) : await findConstituentByEmail(ctx.orgId, key);
  let msg = "created";
  if (!con) msg = "donor_notfound";
  else if (cents(str(fd, "total")) < 1) msg = "bad_amount";
  else {
    await createPledge(ctx.orgId, {
      constituentId: con.id,
      fundId: str(fd, "fundId") || null,
      campaignId: null,
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
  const constituentId = str(fd, "constituentId");
  const fundId = str(fd, "fundId") || null;
  const amount = cents(str(fd, "amount"));
  let msg = "paid";
  if (amount < 1) msg = "bad_amount";
  else {
    await applyPledgePayment(ctx.orgId, { pledgeId, constituentId, fundId, amountCents: amount, receivedAt: new Date() });
  }
  revalidatePath("/app/pledges");
  redirect(`/app/pledges?msg=${msg}`);
}
