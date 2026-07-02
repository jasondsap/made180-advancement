import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { getCampaignById } from "@/repositories/campaigns";
import { campaignSummary } from "@/repositories/campaignStats";
import { CAMPAIGN_SEGMENTS } from "@/repositories/campaignSegments";
import { CampaignHeader } from "../../CampaignHeader";
import { AsksClient } from "./AsksClient";

const SEGMENTS = Object.entries(CAMPAIGN_SEGMENTS).map(([key, s]) => ({
  key,
  label: s.label,
  description: s.description,
}));

export default async function CampaignAsksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { msg } = await searchParams;
  const campaign = await getCampaignById(ctx.orgId, id);
  if (!campaign) notFound();
  const summary = await campaignSummary(ctx.orgId, campaign.id);

  return (
    <div>
      <CampaignHeader campaign={campaign} raisedCents={summary.raisedCents} active="asks" />
      {msg === "sent" && (
        <p style={{ background: "#edf1ec", color: "#2F4032", padding: ".6rem .8rem", borderRadius: 8, fontSize: ".88rem" }}>
          Appeal sent. Track its performance under the Appeals tab.
        </p>
      )}
      {canManage(ctx.role) ? (
        <AsksClient campaignId={campaign.id} segments={SEGMENTS} />
      ) : (
        <p style={{ color: "#999" }}>Sending asks requires an admin role.</p>
      )}
    </div>
  );
}
