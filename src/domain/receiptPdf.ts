import { jsPDF } from "jspdf";
import type { AddressJson, GiftType, TributeType } from "@/types/db";

/**
 * IRS-compliant tax-receipt PDF (jsPDF). Pure: takes data, returns a Buffer.
 *
 * Includes org legal name + EIN, donor name + address, gift date/amount/fund,
 * and the standard "no goods or services" substantiation statement. Written
 * acknowledgment is required for any single gift >= $250; we send it for ALL
 * gifts so there's no gap. Adjust the statement if a quid-pro-quo applies.
 */
export interface ReceiptData {
  org: {
    legal_name: string;
    ein: string | null;
    receipt_signature_name: string | null;
    address_json: AddressJson | null;
    primary_color?: string | null;
  };
  donor: {
    name: string;
    email: string;
    address: AddressJson | null;
  };
  gift: {
    amountCents: number;
    fundName: string | null;
    giftType: GiftType;
    receivedAt: Date;
    tributeType: TributeType | null;
    tributeName: string | null;
    benefitFmvCents?: number | null;
    benefitDescription?: string | null;
  };
  receiptNumber: string;
}

/** Parse '#rrggbb' → [r,g,b]; null/invalid → a near-black default. */
function brandRgb(hex: string | null | undefined): [number, number, number] {
  const m = (hex ?? "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return [20, 20, 20];
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export function buildReceiptPdf(data: ReceiptData): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792 pt
  const left = 56;
  const right = 556;
  let y = 64;

  const orgAddr = data.org.address_json ?? {};
  const [br, bg, bb] = brandRgb(data.org.primary_color);

  // Header: org name (in the org's brand color) + address + EIN
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(br, bg, bb);
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

  // Title + receipt number
  y += 20;
  doc.setTextColor(br, bg, bb).setFont("helvetica", "bold").setFontSize(14);
  doc.text("Official Donation Receipt", left, y);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(`Receipt No. ${data.receiptNumber}`, right, y, { align: "right" });
  y += 8;
  doc.setDrawColor(210).line(left, y, right, y);

  // Donor block
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
    [da.city, da.state, da.zip].filter(Boolean).join(", "),
    data.donor.email,
  ].filter(Boolean) as string[];
  donorLines.forEach((line) => {
    doc.text(line, left, y);
    y += 14;
  });

  // Gift detail rows
  y += 18;
  const fmv = data.gift.benefitFmvCents ?? 0;
  const isQpq = fmv > 0;
  const deductible = Math.max(0, data.gift.amountCents - fmv);
  const rows: [string, string][] = [
    ["Date of Gift", fmtDate(data.gift.receivedAt)],
    [isQpq ? "Amount Paid" : "Amount", money(data.gift.amountCents)],
    ["Designation", data.gift.fundName ?? "General Fund"],
    ["Gift Type", data.gift.giftType === "recurring" ? "Recurring (monthly)" : "One-time"],
  ];
  if (isQpq) {
    rows.push(["Goods/Services Received", data.gift.benefitDescription || "Goods or services"]);
    rows.push(["Fair Market Value", money(fmv)]);
    rows.push(["Tax-Deductible Amount", money(deductible)]);
  }
  if (data.gift.tributeType && data.gift.tributeName) {
    const label = data.gift.tributeType === "in_memory" ? "In memory of" : "In honor of";
    rows.push([label, data.gift.tributeName]);
  }
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(110);
    doc.text(k, left, y);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
    doc.text(v, left + 160, y);
    y += 10;
    doc.setDrawColor(225).line(left, y, right, y);
    y += 16;
  });

  // IRS substantiation statement
  y += 12;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(70);
  const statement = isQpq
    ? `In exchange for this contribution you received goods or services with an estimated fair ` +
      `market value of ${money(fmv)}. The tax-deductible portion of your contribution is ${money(deductible)}. ` +
      `${data.org.legal_name} is a tax-exempt organization under Section 501(c)(3) of the Internal ` +
      `Revenue Code. Please retain this receipt for your tax records.`
    : `No goods or services were provided in exchange for this contribution. ` +
      `${data.org.legal_name} is a tax-exempt organization under Section 501(c)(3) of the ` +
      `Internal Revenue Code. This contribution is tax-deductible to the extent allowed by law. ` +
      `Please retain this receipt for your tax records.`;
  const wrapped = doc.splitTextToSize(statement, right - left) as string[];
  doc.text(wrapped, left, y);
  y += wrapped.length * 13 + 24;

  // Signature
  if (data.org.receipt_signature_name) {
    doc.setTextColor(20).setFont("helvetica", "normal").setFontSize(10);
    doc.text("With gratitude,", left, y);
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.text(data.org.receipt_signature_name, left, y);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
