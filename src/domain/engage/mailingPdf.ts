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
