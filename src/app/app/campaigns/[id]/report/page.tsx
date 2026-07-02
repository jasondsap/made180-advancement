import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getCampaignById, getPriorCampaign } from "@/repositories/campaigns";
import {
  campaignSummary,
  campaignSourceBreakdown,
  appealPerformance,
  campaignTopDonors,
  CAMPAIGN_SOURCE_LABELS,
} from "@/repositories/campaignStats";
import { usd, fmtNumber, fmtDate } from "@/lib/format";
import { CampaignHeader } from "../../CampaignHeader";

export default async function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const campaign = await getCampaignById(ctx.orgId, id);
  if (!campaign) notFound();

  const [summary, sources, appeals, topDonors, prior] = await Promise.all([
    campaignSummary(ctx.orgId, campaign.id),
    campaignSourceBreakdown(ctx.orgId, campaign.id),
    appealPerformance(ctx.orgId, campaign.id),
    campaignTopDonors(ctx.orgId, campaign.id, 10),
    getPriorCampaign(ctx.orgId, campaign),
  ]);
  const priorSummary = prior ? await campaignSummary(ctx.orgId, prior.id) : null;

  return (
    <div>
      <CampaignHeader campaign={campaign} raisedCents={summary.raisedCents} active="report" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: ".6rem", marginBottom: "1rem" }}>
        <p style={{ color: "var(--app-text-soft)", fontSize: ".88rem", margin: 0 }}>
          Everything below is in the downloadable PDF — formatted for a board packet.
        </p>
        <a href={`/api/campaigns/${campaign.id}/report`} style={btnPrimary}>
          Download board report (PDF)
        </a>
      </div>

      <Card title="Goal attainment">
        <Row label="Raised" value={usd(summary.raisedCents)} />
        <Row label="Goal" value={campaign.goal_cents ? `${usd(campaign.goal_cents)} (${campaign.goal_cents > 0 ? Math.round((summary.raisedCents / campaign.goal_cents) * 100) : 0}% attained)` : "—"} />
        <Row label="Donors" value={`${fmtNumber(summary.donorCount)} (${summary.newDonors} new · ${summary.returningDonors} returning)`} />
        <Row label="Gifts" value={`${fmtNumber(summary.giftCount)} · avg ${usd(summary.avgGiftCents)}`} />
        <Row label="Recurring / one-time" value={`${usd(summary.recurringCents)} / ${usd(summary.oneTimeCents)}`} />
      </Card>

      <Card title="Revenue by source" style={{ marginTop: "1rem" }}>
        {sources.length === 0 ? (
          <Muted>No revenue yet.</Muted>
        ) : (
          <table style={tbl}>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} style={trb}>
                  <td style={td}>{CAMPAIGN_SOURCE_LABELS[s.source]}</td>
                  <td style={{ ...td, textAlign: "right", color: "#777" }}>{fmtNumber(s.count)} gifts</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{usd(s.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Top donors" style={{ marginTop: "1rem" }}>
        {topDonors.length === 0 ? (
          <Muted>No donors yet.</Muted>
        ) : (
          <table style={tbl}>
            <tbody>
              {topDonors.map((d) => (
                <tr key={d.id} style={trb}>
                  <td style={{ ...td, fontStyle: d.isAnonymous ? "italic" : "normal" }}>{d.isAnonymous ? "Anonymous" : d.name}</td>
                  <td style={{ ...td, textAlign: "right", color: "#777" }}>{fmtNumber(d.giftCount)} gifts</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{usd(d.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Appeal performance" style={{ marginTop: "1rem" }}>
        {appeals.length === 0 ? (
          <Muted>No appeals yet — create one under the Appeals tab or send an Ask.</Muted>
        ) : (
          <table style={tbl}>
            <tbody>
              {appeals.map((a) => (
                <tr key={a.id} style={trb}>
                  <td style={td}>{a.name}</td>
                  <td style={{ ...td, color: "#777" }}>{a.channel ?? "—"}{a.sent_on ? ` · ${fmtDate(a.sent_on)}` : ""}</td>
                  <td style={{ ...td, textAlign: "right", color: "#777" }}>{fmtNumber(a.giftCount)} gifts</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{usd(a.raisedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {prior && priorSummary && (
        <Card title={`Comparison — ${prior.name}`} style={{ marginTop: "1rem" }}>
          <table style={tbl}>
            <thead>
              <tr style={{ textAlign: "left", color: "#888", borderBottom: "1px solid #eee" }}>
                <th style={td}>Metric</th>
                <th style={{ ...td, textAlign: "right" }}>This campaign</th>
                <th style={{ ...td, textAlign: "right" }}>Prior</th>
                <th style={{ ...td, textAlign: "right" }}>Change</th>
              </tr>
            </thead>
            <tbody>
              <CompareRow label="Raised" cur={summary.raisedCents} prev={priorSummary.raisedCents} money />
              <CompareRow label="Donors" cur={summary.donorCount} prev={priorSummary.donorCount} />
              <CompareRow label="Gifts" cur={summary.giftCount} prev={priorSummary.giftCount} />
              <CompareRow label="Avg gift" cur={summary.avgGiftCents} prev={priorSummary.avgGiftCents} money />
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function CompareRow({ label, cur, prev, money }: { label: string; cur: number; prev: number; money?: boolean }) {
  const fmt = (v: number) => (money ? usd(v) : fmtNumber(v));
  const change = prev > 0 ? `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}%` : "—";
  return (
    <tr style={trb}>
      <td style={td}>{label}</td>
      <td style={{ ...td, textAlign: "right" }}>{fmt(cur)}</td>
      <td style={{ ...td, textAlign: "right", color: "#777" }}>{fmt(prev)}</td>
      <td style={{ ...td, textAlign: "right", fontWeight: 600, color: cur >= prev ? "#2F4032" : "#9b1c1c" }}>{change}</td>
    </tr>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: ".92rem", padding: ".3rem 0" }}>
      <span style={{ color: "#777" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Card({ title, children, style }: { title: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", ...style }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 .75rem" }}>{title}</h2>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p style={{ color: "#999", fontSize: ".9rem", margin: 0 }}>{children}</p>;
}

const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: ".9rem" };
const trb: React.CSSProperties = { borderBottom: "1px solid #f3f4f3" };
const td: React.CSSProperties = { padding: ".45rem .3rem" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-block" };
