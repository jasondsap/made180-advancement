import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getCampaignById } from "@/repositories/campaigns";
import { getOrgById } from "@/repositories/orgs";
import {
  campaignSummary,
  campaignSourceBreakdown,
  campaignCumulative,
  CAMPAIGN_SOURCE_LABELS,
} from "@/repositories/campaignStats";
import { usd, fmtNumber, fmtDate } from "@/lib/format";
import { env } from "@/lib/env";
import { CampaignHeader } from "../CampaignHeader";
import { CumulativeRaisedChart, SourcePieChart } from "./CampaignCharts";

export default async function CampaignOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const campaign = await getCampaignById(ctx.orgId, id);
  if (!campaign) notFound();

  const [summary, sources, cumulative, org] = await Promise.all([
    campaignSummary(ctx.orgId, campaign.id),
    campaignSourceBreakdown(ctx.orgId, campaign.id),
    campaignCumulative(ctx.orgId, campaign),
    getOrgById(ctx.orgId),
  ]);

  const base = (env().APP_BASE_URL ?? "").replace(/\/$/, "");
  const publicUrl =
    campaign.public_slug && campaign.active && org
      ? `${base}/give/${org.slug}/c/${campaign.public_slug}`
      : null;

  return (
    <div>
      <CampaignHeader campaign={campaign} raisedCents={summary.raisedCents} active="overview" publicUrl={publicUrl} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
        <Stat label="Raised" value={usd(summary.raisedCents)} hint={campaign.goal_cents ? `goal ${usd(campaign.goal_cents)}` : "no goal set"} />
        <Stat label="Donors" value={fmtNumber(summary.donorCount)} hint={`${fmtNumber(summary.newDonors)} new · ${fmtNumber(summary.returningDonors)} returning`} />
        <Stat label="Gifts" value={fmtNumber(summary.giftCount)} hint={`avg ${usd(summary.avgGiftCents)}`} />
        <Stat label="Recurring" value={usd(summary.recurringCents)} hint={`one-time ${usd(summary.oneTimeCents)}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        <Card title="Cumulative raised">
          <CumulativeRaisedChart data={cumulative} goalCents={campaign.goal_cents} />
        </Card>
        <Card title="Revenue by source">
          <SourcePieChart data={sources.map((s) => ({ name: CAMPAIGN_SOURCE_LABELS[s.source], totalCents: s.totalCents }))} />
        </Card>
      </div>

      {(campaign.description || campaign.starts_on || campaign.ends_on) && (
        <Card title="About" style={{ marginTop: "1rem" }}>
          {(campaign.starts_on || campaign.ends_on) && (
            <p style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "#777" }}>
              {campaign.starts_on ? fmtDate(campaign.starts_on) : "—"} → {campaign.ends_on ? fmtDate(campaign.ends_on) : "open-ended"}
            </p>
          )}
          {campaign.description && <p style={{ margin: 0, fontSize: ".92rem", whiteSpace: "pre-wrap" }}>{campaign.description}</p>}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" }}>
      <div style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".04em", color: "#888" }}>{label}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, margin: ".2rem 0" }}>{value}</div>
      {hint && <div style={{ fontSize: ".8rem", color: "#999" }}>{hint}</div>}
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
