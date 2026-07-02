import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canManage } from "@/lib/auth";
import { draftAppealCopy } from "@/domain/campaignAsks";
import { CAMPAIGN_SEGMENTS, type CampaignSegmentKey } from "@/repositories/campaignSegments";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as {
    campaignId?: string;
    segmentKey?: string;
    askAmountCents?: number | null;
  };
  if (!body.campaignId || !body.segmentKey || !(body.segmentKey in CAMPAIGN_SEGMENTS)) {
    return NextResponse.json({ error: "missing campaignId/segmentKey" }, { status: 400 });
  }
  try {
    const draft = await draftAppealCopy(auth.orgId, {
      campaignId: body.campaignId,
      segmentKey: body.segmentKey as CampaignSegmentKey,
      askAmountCents: typeof body.askAmountCents === "number" ? body.askAmountCents : null,
    });
    return NextResponse.json(draft);
  } catch (e) {
    console.error("[assistant] appeal-draft failed", e);
    return NextResponse.json({ error: "Could not draft (check ANTHROPIC_API_KEY)." }, { status: 500 });
  }
}
