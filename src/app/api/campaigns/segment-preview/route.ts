import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canManage } from "@/lib/auth";
import { getCampaignById } from "@/repositories/campaigns";
import { resolveCampaignSegment, CAMPAIGN_SEGMENTS, type CampaignSegmentKey } from "@/repositories/campaignSegments";
import { resolveAudience } from "@/repositories/engage/audience";

export const runtime = "nodejs";

/** Preview a campaign segment: matched constituents + how many are reachable by email (consent-filtered). */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { campaignId?: string; segmentKey?: string };
  if (!body.campaignId || !body.segmentKey || !(body.segmentKey in CAMPAIGN_SEGMENTS)) {
    return NextResponse.json({ error: "missing campaignId/segmentKey" }, { status: 400 });
  }
  const campaign = await getCampaignById(auth.orgId, body.campaignId);
  if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });

  const ids = await resolveCampaignSegment(auth.orgId, campaign, body.segmentKey as CampaignSegmentKey);
  const reachable = ids.length
    ? (await resolveAudience(auth.orgId, { mode: "manual", constituentIds: ids }, "email")).length
    : 0;
  return NextResponse.json({ total: ids.length, reachable });
}
