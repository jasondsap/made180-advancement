import { jsPDF } from "jspdf";
import type { Campaign } from "@/repositories/campaigns";
import type {
  CampaignSummary,
  SourceSlice,
  AppealPerformance,
  CampaignTopDonor,
} from "@/repositories/campaignStats";
import { CAMPAIGN_SOURCE_LABELS } from "@/repositories/campaignStats";

/** Board-ready campaign performance report (one PDF per campaign). */
export interface CampaignReportData {
  org: { legal_name: string; ein: string | null; primary_color?: string | null };
  campaign: Campaign;
  summary: CampaignSummary;
  sources: SourceSlice[];
  appeals: AppealPerformance[];
  topDonors: CampaignTopDonor[];
  /** YoY comparison — omitted when no prior campaign of the same category exists. */
  prior?: { campaign: Campaign; summary: CampaignSummary };
  generatedAt: Date;
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
const pctOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/** Parse '#rrggbb' → [r,g,b]; null/invalid → near-black default. */
function brandRgb(hex: string | null | undefined): [number, number, number] {
  const m = (hex ?? "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return [20, 20, 20];
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

export function buildCampaignReportPdf(data: CampaignReportData): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 56, right = 556;
  let y = 64;
  const [br, bg, bb] = brandRgb(data.org.primary_color);
  const c = data.campaign;
  const s = data.summary;

  const ensureRoom = (needed = 40) => {
    if (y > 760 - needed) { doc.addPage(); y = 64; }
  };
  const sectionTitle = (title: string) => {
    ensureRoom(60);
    y += 26;
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(br, bg, bb).text(title, left, y);
    y += 7;
    doc.setDrawColor(220).line(left, y, right, y);
    y += 16;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
  };

  // ---- Header ----
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(br, bg, bb).text(data.org.legal_name, left, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  const sub = [
    data.org.ein ? `EIN: ${data.org.ein}` : null,
    `Report generated ${fmtDate(data.generatedAt)}`,
  ].filter(Boolean).join("  ·  ");
  doc.text(sub, left, y);

  y += 28;
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(20).text(`Campaign report — ${c.name}`, left, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(
    `${fmtDate(c.starts_on)} → ${c.ends_on ? fmtDate(c.ends_on) : "open-ended"}${c.category ? `  ·  ${c.category.replace("_", " ")}` : ""}`,
    left,
    y,
  );

  // ---- Headline stats ----
  y += 26;
  const goal = c.goal_cents;
  const stats: Array<[string, string]> = [
    ["Raised", money(s.raisedCents)],
    ["Goal", goal ? `${money(goal)} (${pctOf(s.raisedCents, goal)} attained)` : "—"],
    ["Donors", `${s.donorCount.toLocaleString("en-US")} (${s.newDonors} new · ${s.returningDonors} returning)`],
    ["Gifts", `${s.giftCount.toLocaleString("en-US")} · avg ${money(s.avgGiftCents)}`],
    ["Recurring / one-time", `${money(s.recurringCents)} / ${money(s.oneTimeCents)}`],
  ];
  doc.setFontSize(10);
  for (const [label, value] of stats) {
    doc.setFont("helvetica", "bold").setTextColor(110).text(label, left, y);
    doc.setFont("helvetica", "normal").setTextColor(20).text(value, left + 140, y);
    y += 16;
  }

  // ---- Revenue by source ----
  sectionTitle("Revenue by source");
  if (data.sources.length === 0) {
    doc.setTextColor(120).text("No revenue recorded yet.", left, y);
    y += 14;
  } else {
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(110);
    doc.text("Source", left, y);
    doc.text("Gifts", right - 130, y, { align: "right" });
    doc.text("Raised", right, y, { align: "right" });
    y += 6;
    doc.setDrawColor(225).line(left, y, right, y);
    y += 13;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
    for (const src of data.sources) {
      ensureRoom();
      doc.text(`${CAMPAIGN_SOURCE_LABELS[src.source] ?? src.source} (${pctOf(src.totalCents, s.raisedCents)})`, left, y);
      doc.text(String(src.count), right - 130, y, { align: "right" });
      doc.text(money(src.totalCents), right, y, { align: "right" });
      y += 15;
    }
  }

  // ---- Appeal performance ----
  sectionTitle("Appeal performance");
  if (data.appeals.length === 0) {
    doc.setTextColor(120).text("No appeals created for this campaign.", left, y);
    y += 14;
  } else {
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(110);
    doc.text("Appeal", left, y);
    doc.text("Channel", left + 190, y);
    doc.text("Sent", left + 260, y);
    doc.text("Gifts", right - 170, y, { align: "right" });
    doc.text("Avg", right - 100, y, { align: "right" });
    doc.text("Raised", right, y, { align: "right" });
    y += 6;
    doc.setDrawColor(225).line(left, y, right, y);
    y += 13;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
    for (const a of data.appeals) {
      ensureRoom();
      doc.text(doc.splitTextToSize(a.name, 180)[0] as string, left, y);
      doc.text(a.channel ?? "—", left + 190, y);
      doc.text(a.sent_on ? fmtDate(a.sent_on) : "—", left + 260, y);
      doc.text(String(a.giftCount), right - 170, y, { align: "right" });
      doc.text(a.giftCount ? money(a.avgGiftCents) : "—", right - 100, y, { align: "right" });
      doc.text(money(a.raisedCents), right, y, { align: "right" });
      y += 15;
    }
  }

  // ---- Top donors (anonymity respected) ----
  sectionTitle("Top donors");
  if (data.topDonors.length === 0) {
    doc.setTextColor(120).text("No donors yet.", left, y);
    y += 14;
  } else {
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(110);
    doc.text("Donor", left, y);
    doc.text("Gifts", right - 130, y, { align: "right" });
    doc.text("Total", right, y, { align: "right" });
    y += 6;
    doc.setDrawColor(225).line(left, y, right, y);
    y += 13;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
    for (const d of data.topDonors) {
      ensureRoom();
      doc.text(d.isAnonymous ? "Anonymous" : d.name, left, y);
      doc.text(String(d.giftCount), right - 130, y, { align: "right" });
      doc.text(money(d.totalCents), right, y, { align: "right" });
      y += 15;
    }
  }

  // ---- Year-over-year ----
  if (data.prior) {
    const p = data.prior;
    sectionTitle(`Comparison — ${p.campaign.name}`);
    const delta = (cur: number, prev: number) => {
      if (prev <= 0) return "—";
      const d = Math.round(((cur - prev) / prev) * 100);
      return `${d >= 0 ? "+" : ""}${d}%`;
    };
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(110);
    doc.text("Metric", left, y);
    doc.text("This campaign", right - 220, y, { align: "right" });
    doc.text("Prior", right - 100, y, { align: "right" });
    doc.text("Change", right, y, { align: "right" });
    y += 6;
    doc.setDrawColor(225).line(left, y, right, y);
    y += 13;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
    const rows: Array<[string, string, string, string]> = [
      ["Raised", money(s.raisedCents), money(p.summary.raisedCents), delta(s.raisedCents, p.summary.raisedCents)],
      ["Donors", String(s.donorCount), String(p.summary.donorCount), delta(s.donorCount, p.summary.donorCount)],
      ["Gifts", String(s.giftCount), String(p.summary.giftCount), delta(s.giftCount, p.summary.giftCount)],
      ["Avg gift", money(s.avgGiftCents), money(p.summary.avgGiftCents), delta(s.avgGiftCents, p.summary.avgGiftCents)],
    ];
    for (const [label, cur, prev, chg] of rows) {
      ensureRoom();
      doc.text(label, left, y);
      doc.text(cur, right - 220, y, { align: "right" });
      doc.text(prev, right - 100, y, { align: "right" });
      doc.text(chg, right, y, { align: "right" });
      y += 15;
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}
