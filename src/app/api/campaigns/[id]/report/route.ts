import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canManage } from "@/lib/auth";
import { getOrgById } from "@/repositories/orgs";
import { getCampaignById, getPriorCampaign } from "@/repositories/campaigns";
import {
  campaignSummary,
  campaignSourceBreakdown,
  appealPerformance,
  campaignTopDonors,
} from "@/repositories/campaignStats";
import { buildCampaignReportPdf } from "@/domain/campaignReportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Board-ready campaign performance report PDF (admin-only route group). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const campaign = await getCampaignById(auth.orgId, id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  const org = await getOrgById(auth.orgId);
  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 });

  const [summary, sources, appeals, topDonors, prior] = await Promise.all([
    campaignSummary(auth.orgId, campaign.id),
    campaignSourceBreakdown(auth.orgId, campaign.id),
    appealPerformance(auth.orgId, campaign.id),
    campaignTopDonors(auth.orgId, campaign.id, 10),
    getPriorCampaign(auth.orgId, campaign),
  ]);
  const priorBlock = prior
    ? { campaign: prior, summary: await campaignSummary(auth.orgId, prior.id) }
    : undefined;

  const pdf = buildCampaignReportPdf({
    org: { legal_name: org.legal_name, ein: org.ein, primary_color: org.primary_color },
    campaign,
    summary,
    sources,
    appeals,
    topDonors,
    prior: priorBlock,
    generatedAt: new Date(),
  });

  const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "campaign";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${slug}-report.pdf`,
    },
  });
}
