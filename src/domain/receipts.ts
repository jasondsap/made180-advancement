import { getOrgById } from "@/repositories/orgs";
import { getConstituentById } from "@/repositories/constituents";
import { getFundById } from "@/repositories/funds";
import { getGiftById } from "@/repositories/gifts";
import {
  allocateReceiptNumber,
  setGiftReceiptNumber,
  markGiftReceiptSent,
} from "@/repositories/receipts";
import { buildReceiptPdf } from "@/domain/receiptPdf";
import { sendReceiptEmail } from "@/lib/email";

/**
 * Issue (generate + email) a tax receipt for a succeeded gift.
 *
 * - Allocates a sequential receipt_number if the gift doesn't already have one
 *   (so a resend reuses the same number).
 * - Renders the PDF and emails it via Resend, then stamps receipt_sent_at.
 *
 * Throws on failure. Callers in the webhook wrap this best-effort: the gift is
 * already logged, and a failed delivery is recoverable via the admin "resend"
 * action — we do NOT fail the webhook over email problems.
 */
export interface IssueReceiptResult {
  receiptNumber: string;
  emailId: string | null;
  alreadyHadNumber: boolean;
}

export async function issueReceipt(orgId: string, giftId: string): Promise<IssueReceiptResult> {
  const gift = await getGiftById(orgId, giftId);
  if (!gift) throw new Error(`issueReceipt: gift ${giftId} not found for org ${orgId}`);

  const org = await getOrgById(orgId);
  if (!org) throw new Error(`issueReceipt: org ${orgId} not found`);

  const constituent = await getConstituentById(orgId, gift.constituent_id);
  if (!constituent) throw new Error(`issueReceipt: constituent ${gift.constituent_id} not found`);
  if (!constituent.email) {
    throw new Error(`issueReceipt: constituent ${constituent.id} has no email`);
  }

  const fund = gift.fund_id ? await getFundById(orgId, gift.fund_id) : undefined;

  // Allocate number if missing (year from the gift's received date, else now).
  const alreadyHadNumber = Boolean(gift.receipt_number);
  const year = (gift.received_at ?? new Date()).getFullYear();
  const receiptNumber =
    gift.receipt_number ?? (await allocateReceiptNumber(orgId, org.slug, year));
  if (!alreadyHadNumber) {
    await setGiftReceiptNumber(orgId, giftId, receiptNumber);
  }

  const donorName =
    [constituent.first_name, constituent.last_name].filter(Boolean).join(" ") || "Friend";

  const pdf = buildReceiptPdf({
    org: {
      legal_name: org.legal_name,
      ein: org.ein,
      receipt_signature_name: org.receipt_signature_name,
      address_json: org.address_json,
    },
    donor: { name: donorName, email: constituent.email, address: constituent.address_json },
    gift: {
      amountCents: gift.amount_cents,
      fundName: fund?.name ?? null,
      giftType: gift.gift_type,
      receivedAt: gift.received_at ?? new Date(),
      tributeType: gift.tribute_type,
      tributeName: gift.tribute_name,
      benefitFmvCents: gift.benefit_fmv_cents,
      benefitDescription: gift.benefit_description,
    },
    receiptNumber,
  });

  const amount = (gift.amount_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const { id: emailId } = await sendReceiptEmail({
    fromName: org.legal_name,
    fromEmail: org.receipt_from_email,
    to: constituent.email,
    subject: `Your donation receipt — ${receiptNumber}`,
    html: receiptEmailHtml({ donorName, amount, orgName: org.legal_name }),
    pdf,
    pdfFilename: `receipt-${receiptNumber}.pdf`,
  });

  await markGiftReceiptSent(orgId, giftId, new Date());

  return { receiptNumber, emailId, alreadyHadNumber };
}

function receiptEmailHtml(p: { donorName: string; amount: string; orgName: string }): string {
  return `
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.55">
    <p>Dear ${escapeHtml(p.donorName)},</p>
    <p>Thank you for your generous gift of <strong>${p.amount}</strong> to ${escapeHtml(p.orgName)}.
       Your support makes a real difference.</p>
    <p>Your official tax receipt is attached as a PDF for your records.</p>
    <p style="margin-top:28px">With gratitude,<br/>${escapeHtml(p.orgName)}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"/>
    <p style="font-size:12px;color:#888">
      This receipt confirms a charitable contribution. No goods or services were provided
      in exchange unless otherwise noted. Please retain for your tax records.
    </p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
