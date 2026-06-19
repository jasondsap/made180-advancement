import { jsPDF } from "jspdf";
import type { AddressJson } from "@/types/db";

/** Year-end consolidated giving statement (one PDF summarizing a donor's year). */
export interface YearEndData {
  org: { legal_name: string; ein: string | null; address_json: AddressJson | null; receipt_signature_name: string | null };
  donor: { name: string; email: string | null; address: AddressJson | null };
  year: number;
  lines: { date: Date; fund: string | null; amountCents: number; deductibleCents: number }[];
  totalCents: number;
  deductibleCents: number;
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export function buildYearEndStatementPdf(data: YearEndData): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 56, right = 556;
  let y = 64;
  const orgAddr = data.org.address_json ?? {};

  doc.setFont("helvetica", "bold").setFontSize(18).text(data.org.legal_name, left, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  [orgAddr.line1, [orgAddr.city, orgAddr.state, orgAddr.zip].filter(Boolean).join(", "), data.org.ein ? `EIN: ${data.org.ein}` : null]
    .filter(Boolean)
    .forEach((l) => { doc.text(String(l), left, y); y += 13; });

  y += 18;
  doc.setTextColor(20).setFont("helvetica", "bold").setFontSize(14).text(`${data.year} Annual Giving Statement`, left, y);
  y += 8;
  doc.setDrawColor(210).line(left, y, right, y);

  y += 26;
  doc.setFont("helvetica", "bold").setFontSize(11).text("Donor", left, y);
  y += 15;
  doc.setFont("helvetica", "normal").setFontSize(11);
  const da = data.donor.address ?? {};
  [data.donor.name, da.line1, [da.city, da.state, da.zip].filter(Boolean).join(", "), data.donor.email]
    .filter(Boolean)
    .forEach((l) => { doc.text(String(l), left, y); y += 14; });

  // Table header
  y += 16;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(110);
  doc.text("Date", left, y);
  doc.text("Designation", left + 110, y);
  doc.text("Amount", right - 150, y, { align: "right" });
  doc.text("Deductible", right, y, { align: "right" });
  y += 6;
  doc.setDrawColor(225).line(left, y, right, y);
  y += 14;

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
  for (const line of data.lines) {
    if (y > 720) { doc.addPage(); y = 64; }
    doc.text(fmtDate(line.date), left, y);
    doc.text(line.fund ?? "General", left + 110, y);
    doc.text(money(line.amountCents), right - 150, y, { align: "right" });
    doc.text(money(line.deductibleCents), right, y, { align: "right" });
    y += 16;
  }

  y += 4;
  doc.setDrawColor(180).line(left, y, right, y);
  y += 16;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("Total contributed", left, y);
  doc.text(money(data.totalCents), right - 150, y, { align: "right" });
  doc.text(money(data.deductibleCents), right, y, { align: "right" });

  y += 30;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(70);
  const statement =
    `This statement summarizes contributions received during ${data.year}. Except where a fair ` +
    `market value is shown, no goods or services were provided in exchange. ${data.org.legal_name} ` +
    `is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code. Please ` +
    `retain this statement for your tax records.`;
  const wrapped = doc.splitTextToSize(statement, right - left) as string[];
  doc.text(wrapped, left, y);

  return Buffer.from(doc.output("arraybuffer"));
}
