import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { flags } from "@/lib/featureFlags";
import { getConnectionByUserId } from "@/repositories/canvaConnections";
import { CampaignForm } from "../CampaignForm";
import { createCampaignAction } from "../actions";

export default async function NewCampaignPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) {
    return <p style={{ color: "#999" }}>Creating campaigns requires an admin role.</p>;
  }
  const canvaEnabled = flags().canva;
  const canvaConnected = canvaEnabled && Boolean(await getConnectionByUserId(ctx.user.id));
  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/app/campaigns" style={{ fontSize: ".82rem", color: "var(--app-text-soft)", textDecoration: "none" }}>
        ← Campaigns
      </Link>
      <h1 style={{ fontSize: "1.5rem", margin: ".35rem 0 1rem" }}>New campaign</h1>
      <CampaignForm
        action={createCampaignAction}
        submitLabel="Create campaign"
        canvaEnabled={canvaEnabled}
        canvaConnected={canvaConnected}
      />
    </div>
  );
}
