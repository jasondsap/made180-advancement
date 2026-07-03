import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { flags } from "@/lib/featureFlags";
import { getCampaignById } from "@/repositories/campaigns";
import { getConnectionByUserId } from "@/repositories/canvaConnections";
import { getMediaByUrl } from "@/repositories/canvaMedia";
import { CampaignForm } from "../../CampaignForm";
import { updateCampaignAction } from "../../actions";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const campaign = await getCampaignById(ctx.orgId, id);
  if (!campaign) notFound();
  if (!canManage(ctx.role)) {
    return <p style={{ color: "#999" }}>Editing campaigns requires an admin role.</p>;
  }
  const canvaEnabled = flags().canva;
  const canvaConnected = canvaEnabled && Boolean(await getConnectionByUserId(ctx.user.id));
  const coverMedia =
    canvaEnabled && campaign.cover_image_url
      ? await getMediaByUrl(ctx.orgId, campaign.cover_image_url)
      : undefined;
  return (
    <div style={{ maxWidth: 640 }}>
      <Link href={`/app/campaigns/${campaign.id}`} style={{ fontSize: ".82rem", color: "var(--app-text-soft)", textDecoration: "none" }}>
        ← {campaign.name}
      </Link>
      <h1 style={{ fontSize: "1.5rem", margin: ".35rem 0 1rem" }}>Edit campaign</h1>
      <CampaignForm
        campaign={campaign}
        action={updateCampaignAction}
        submitLabel="Save changes"
        canvaEnabled={canvaEnabled}
        canvaConnected={canvaConnected}
        coverMediaId={coverMedia?.id ?? null}
      />
    </div>
  );
}
