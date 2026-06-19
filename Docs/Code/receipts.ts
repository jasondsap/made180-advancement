// ============================================================
// lib/receipts/send.ts  (+ lib/receipts/pdf.ts)
// Generates an IRS-compliant tax-receipt PDF (jsPDF) and emails it via Resend.
// Collected here for review; split pdf.ts / send.ts per the import paths.
//
// IRS note: written acknowledgment is required for any single gift >= $250.
// We send for ALL gifts so there's no gap. The "no goods or services"
// statement is the standard substantiation language; adjust per-gift if a
// quid-pro-quo (e.g. event ticket) applies.
// ============================================================

import { jsPDF } from "jspdf";
import { Resend } from "resend";
import { getOrgById } from "@/lib/repos/orgs";

const resend = new Resend(process.env.RESEND_API_KEY!);

// ---------------------------------------------------------------
// lib/receipts/pdf.ts
// ---------------------------------------------------------------

type ReceiptData = {
  org: {
    legal_name: string;
    ein: string | null;
    receipt_signature_name: string | null;
    address_json: { line1?: string; line2?: string; city?: string; state?: string; zip?: string } | null;
  };
  donor: {
    name: string;
    email: string;
    address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string } | null;
  };
  gift: {
    amountCents: number;
    fundName: string | null;
    giftType: string;
    receivedAt: Date;
    tributeType?: string | null;
    tributeName?: string | null;
  };
  receiptNumber: string;
};

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// Returns the PDF as a Buffer (for email attachment).
export function buildReceiptPdf(data: ReceiptData): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792 pt
  const left = 56;
  const right = 556;
  let y = 64;

  const orgAddr = data.org.address_json ?? {};

  // ---- header: org name + address ----
  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text(data.org.legal_name, left, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  const orgLines = [
    orgAddr.line1,
    orgAddr.line2,
    [orgAddr.city, orgAddr.state, orgAddr.zip].filter(Boolean).join(", "),
    data.org.ein ? `EIN: ${data.org.ein}` : null,
  ].filter(Boolean) as string[];
  orgLines.forEach((line) => {
    doc.text(line, left, y);
    y += 13;
  });

  // ---- title ----
  y += 20;
  doc.setTextColor(20).setFont("helvetica", "bold").setFontSize(14);
  doc.text("Official Donation Receipt", left, y);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Receipt No. ${data.receiptNumber}`, right, y, { align: "right" });
  y += 8;
  doc.setDrawColor(210).line(left, y, right, y);

  // ---- donor block ----
  y += 28;
  doc.setTextColor(20).setFont("helvetica", "bold").setFontSize(11);
  doc.text("Donor", left, y);
  y += 15;
  doc.setFont("helvetica", "normal").setFontSize(11);
  const da = data.donor.address ?? {};
  const donorLines = [
    data.donor.name,
    da.line1,
    da.line2,
    [da.city, da.state, da.postal_code].filter(Boolean).join(", "),
    data.donor.email,
  ].filter(Boolean) as string[];
  donorLines.forEach((line) => {
    doc.text(line, left, y);
    y += 14;
  });

  // ---- gift detail table ----
  y += 18;
  const rows: [string, string][] = [
    ["Date of Gift", fmtDate(data.gift.receivedAt)],
    ["Amount", money(data.gift.amountCents)],
    ["Designation", data.gift.fundName ?? "General Fund"],
    ["Gift Type", data.gift.giftType === "recurring" ? "Recurring (monthly)" : "One-time"],
  ];
  if (data.gift.tributeType && data.gift.tributeName) {
    const label = data.gift.tributeType === "in_memory" ? "In memory of" : "In honor of";
    rows.push([label, data.gift.tributeName]);
  }
  doc.setDrawColor(225);
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(110);
    doc.text(k, left, y);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
    doc.text(v, left + 160, y);
    y += 10;
    doc.line(left, y, right, y);
    y += 16;
  });

  // ---- IRS substantiation statement ----
  y += 12;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(70);
  const statement =
    `No goods or services were provided in exchange for this contribution. ` +
    `${data.org.legal_name} is a tax-exempt organization under Section 501(c)(3) of the ` +
    `Internal Revenue Code. This contribution is tax-deductible to the extent allowed by law. ` +
    `Please retain this receipt for your tax records.`;
  const wrapped = doc.splitTextToSize(statement, right - left);
  doc.text(wrapped, left, y);
  y += wrapped.length * 13 + 24;

  // ---- signature ----
  if (data.org.receipt_signature_name) {
    doc.setTextColor(20).setFontSize(10);
    doc.text("With gratitude,", left, y);
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.text(data.org.receipt_signature_name, left, y);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ---------------------------------------------------------------
// lib/receipts/send.ts
// ---------------------------------------------------------------

type SendArgs = {
  orgId: string;
  gift: {
    amount_cents: number;
    gift_type: string;
    received_at: string | Date;
    tribute_type?: string | null;
    tribute_name?: string | null;
  };
  constituent: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    address_json?: Record<string, unknown> | null;
  };
  receiptNumber: string;
  fundName?: string | null;
};

export async function sendReceiptEmail(args: SendArgs): Promise<void> {
  const { gift, constituent, receiptNumber } = args;

  if (!constituent.email) {
    console.warn(`[receipt] no email for constituent ${constituent.id}; skipping send`);
    return;
  }

  const org = await getOrgById(args.orgId);
  if (!org) throw new Error(`org ${args.orgId} not found for receipt`);

  const donorName =
    [constituent.first_name, constituent.last_name].filter(Boolean).join(" ") || "Friend";
  const receivedAt =
    gift.received_at instanceof Date ? gift.received_at : new Date(gift.received_at);

  const pdf = buildReceiptPdf({
    org: {
      legal_name: org.legal_name,
      ein: org.ein,
      receipt_signature_name: org.receipt_signature_name,
      address_json: org.address_json,
    },
    donor: {
      name: donorName,
      email: constituent.email,
      address: (constituent.address_json as ReceiptData["donor"]["address"]) ?? null,
    },
    gift: {
      amountCents: gift.amount_cents,
      fundName: args.fundName ?? null,
      giftType: gift.gift_type,
      receivedAt,
      tributeType: gift.tribute_type ?? null,
      tributeName: gift.tribute_name ?? null,
    },
    receiptNumber,
  });

  const amount = (gift.amount_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const fromName = org.legal_name;
  const fromEmail = org.receipt_from_email || process.env.RESEND_FROM_FALLBACK!;

  await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: constituent.email,
    subject: `Your donation receipt — ${receiptNumber}`,
    html: receiptEmailHtml({ donorName, amount, orgName: org.legal_name }),
    attachments: [
      {
        filename: `receipt-${receiptNumber}.pdf`,
        content: pdf.toString("base64"),
      },
    ],
  });
}

function receiptEmailHtml(p: { donorName: string; amount: string; orgName: string }): string {
  return `
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.55">
    <p>Dear ${p.donorName},</p>
    <p>Thank you for your generous gift of <strong>${p.amount}</strong> to ${p.orgName}.
       Your support makes a real difference.</p>
    <p>Your official tax receipt is attached as a PDF for your records.</p>
    <p style="margin-top:28px">With gratitude,<br/>${p.orgName}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"/>
    <p style="font-size:12px;color:#888">
      This receipt confirms a charitable contribution. No goods or services were provided
      in exchange unless otherwise noted. Please retain for your tax records.
    </p>
  </div>`;
}
