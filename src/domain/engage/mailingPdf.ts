import { jsPDF } from "jspdf";
import type { Constituent, Org } from "@/types/db";
import type { EngageAddress, EngageMergeField } from "@/types/engage";
import { renderMergeTags } from "@/domain/engage/render";

/**
 * Merged letter PDF — one page per recipient, letter format. Org letterhead +
 * date + recipient address block + merge-rendered body + signature. Pure: data
 * in, Buffer out (mirrors receiptPdf).
 */
function brandRgb(hex: string | null | undefined): [number, number, number] {
  const m = (hex ?? "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return [20, 20, 20];
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const recipientName = (c: Constituent) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.org_name || "Friend";

/** Recipient address block lines (name + street + city/state/zip), blanks dropped. */
function recipientAddressLines(c: Constituent): string[] {
  const a = c.address_json ?? {};
  return [
    recipientName(c),
    a.line1,
    a.line2,
    [a.city, a.state, a.zip].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];
}

/** Org return-address lines, preferring the engage "organization" address, else org.address_json. */
function returnAddressLines(org: Org, orgAddress: EngageAddress | undefined): string[] {
  if (orgAddress) {
    return [
      org.legal_name,
      orgAddress.line1,
      orgAddress.line2,
      [orgAddress.city, orgAddress.state, orgAddress.postal_code].filter(Boolean).join(", "),
    ].filter(Boolean) as string[];
  }
  const a = org.address_json ?? {};
  return [
    org.legal_name,
    a.line1,
    a.line2,
    [a.city, a.state, a.zip].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];
}

export function buildMailingPdf(opts: {
  org: Org;
  orgAddress: EngageAddress | undefined;
  bodyMd: string;
  mergeFields: EngageMergeField[];
  recipients: Constituent[];
  now: Date;
}): Buffer {
  const { org, orgAddress, bodyMd, mergeFields, recipients, now } = opts;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 64;
  const right = 548;
  const [br, bg, bb] = brandRgb(org.primary_color);

  const orgLine = orgAddress
    ? [orgAddress.line1, `${orgAddress.city}, ${orgAddress.state} ${orgAddress.postal_code}`].filter(Boolean).join(" · ")
    : (() => {
        const a = org.address_json ?? {};
        return [a.line1, [a.city, a.state, a.zip].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
      })();

  recipients.forEach((c, i) => {
    if (i > 0) doc.addPage();
    let y = 72;

    // Letterhead
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(br, bg, bb).text(org.legal_name, left, y);
    y += 14;
    if (orgLine) {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(120).text(orgLine, left, y);
      y += 10;
    }
    doc.setDrawColor(210).line(left, y, right, y);
    y += 30;

    // Date
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90).text(fmtDate(now), left, y);
    y += 24;

    // Recipient address block
    const a = c.address_json ?? {};
    const addrLines = [recipientName(c), a.line1, a.line2, [a.city, a.state, a.zip].filter(Boolean).join(", ")].filter(Boolean) as string[];
    doc.setTextColor(20).setFontSize(11);
    addrLines.forEach((line) => { doc.text(line, left, y); y += 14; });
    y += 18;

    // Body (merge-rendered, wrapped)
    const body = renderMergeTags(bodyMd, c, mergeFields);
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(30);
    for (const para of body.split(/\r?\n/)) {
      if (para.trim() === "") { y += 8; continue; }
      const wrapped = doc.splitTextToSize(para, right - left) as string[];
      for (const ln of wrapped) {
        if (y > 720) { doc.addPage(); y = 72; }
        doc.text(ln, left, y);
        y += 15;
      }
    }

    // Signature
    if (org.receipt_signature_name) {
      y += 24;
      doc.text("With gratitude,", left, y);
      y += 30;
      doc.setFont("helvetica", "bold").text(org.receipt_signature_name, left, y);
    }
  });

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Avery 5160 address labels — 3 columns × 10 rows = 30 per Letter page.
 * Label 2.625"×1"; 0.5" top margin, 0.1875" side margins, no row gap. Recipient
 * address block per label, vertically centered. Pure: data in, Buffer out.
 */
export function buildLabelsPdf(opts: { recipients: Constituent[] }): Buffer {
  const { recipients } = opts;
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // Avery 5160 geometry in points (72pt/in).
  const cols = 3;
  const rows = 10;
  const perPage = cols * rows;
  const labelW = 189; // 2.625"
  const labelH = 72; // 1"
  const topMargin = 36; // 0.5"
  const leftMargin = 13.5; // 0.1875"
  const colPitch = 198; // 2.75" (label + 0.125" gutter)
  const rowPitch = 72; // 1" (no vertical gap)
  const padX = 10;
  const lineH = 11;

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(20);

  recipients.forEach((c, i) => {
    const slot = i % perPage;
    if (i > 0 && slot === 0) doc.addPage();
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const cellX = leftMargin + col * colPitch;
    const cellY = topMargin + row * rowPitch;

    const lines = recipientAddressLines(c);
    const blockH = lines.length * lineH;
    let y = cellY + (labelH - blockH) / 2 + lineH - 2; // vertically centered baseline
    for (const line of lines) {
      const text = doc.splitTextToSize(line, labelW - padX * 2)[0] as string; // clip to one line
      doc.text(text, cellX + padX, y);
      y += lineH;
    }
  });

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * #10 business envelopes — one envelope per page (9.5"×4.125", landscape).
 * Org return address top-left, recipient block centered. Pure: data in, Buffer out.
 */
export function buildEnvelopesPdf(opts: {
  org: Org;
  orgAddress: EngageAddress | undefined;
  recipients: Constituent[];
}): Buffer {
  const { org, orgAddress, recipients } = opts;
  // #10 envelope: 9.5"×4.125" = 684×297 pt, landscape.
  const envW = 684;
  const envH = 297;
  const doc = new jsPDF({ unit: "pt", format: [envW, envH], orientation: "landscape" });

  const returnLines = returnAddressLines(org, orgAddress);

  recipients.forEach((c, i) => {
    if (i > 0) doc.addPage([envW, envH], "landscape");

    // Return address — top-left.
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(110);
    let ry = 36;
    for (const line of returnLines) {
      doc.text(line, 36, ry);
      ry += 10;
    }

    // Recipient block — centered-ish (roughly 4.2" in, 2" down).
    doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(20);
    let y = 168;
    for (const line of recipientAddressLines(c)) {
      doc.text(line, 306, y);
      y += 16;
    }
  });

  return Buffer.from(doc.output("arraybuffer"));
}
