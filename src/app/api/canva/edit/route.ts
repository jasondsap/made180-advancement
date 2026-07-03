import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canManage } from "@/lib/auth";
import { flags } from "@/lib/featureFlags";
import { getFreshAccessToken, getDesign, CanvaNotConnectedError } from "@/lib/canva";
import { getMediaById } from "@/repositories/canvaMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edit-in-Canva deep link: fetch a fresh (temporary) edit_url for the design
 * behind a canva_media row and redirect with correlation_state = media id, so
 * Canva's Return button lands on /api/canva/return with enough context to
 * re-export and overwrite the same S3 object.
 */
export async function GET(req: NextRequest) {
  if (!flags().canva) return NextResponse.json({ error: "not found" }, { status: 404 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const mediaId = req.nextUrl.searchParams.get("media");
  if (!mediaId) return NextResponse.json({ error: "missing media" }, { status: 400 });
  // Org-scoped lookup: a cross-org media id 404s here (tenancy).
  const media = await getMediaById(auth.orgId, mediaId);
  if (!media) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const token = await getFreshAccessToken(auth.user.id);
    const design = await getDesign(token, media.canva_design_id);
    if (!design.editUrl) {
      return NextResponse.json({ error: "This design can no longer be edited (deleted in Canva?)." }, { status: 409 });
    }
    const url = new URL(design.editUrl);
    url.searchParams.set("correlation_state", media.id);
    return NextResponse.redirect(url.toString(), 302);
  } catch (e) {
    if (e instanceof CanvaNotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 409 });
    }
    console.error("[canva] edit link failed", e);
    return NextResponse.json({ error: "Could not open the design in Canva." }, { status: 500 });
  }
}
