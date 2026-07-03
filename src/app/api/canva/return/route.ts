import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { flags } from "@/lib/featureFlags";
import { putPublicImage } from "@/lib/s3";
import {
  verifyCorrelationJwt,
  getFreshAccessToken,
  createExport,
  pollExportAndDownload,
  CanvaNotConnectedError,
} from "@/lib/canva";
import { getConnectionByUserId } from "@/repositories/canvaConnections";
import { getMediaById, touchMedia, type CanvaMedia } from "@/repositories/canvaMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_BUDGET_MS = 20_000;

/** Where to land the user after a round trip, by what the image was placed on. */
function destinationFor(media: CanvaMedia, q: string): string {
  switch (media.target_kind) {
    case "campaign_cover":
      return media.target_id ? `/app/campaigns/${media.target_id}/edit?canva=${q}` : `/app/campaigns`;
    case "org_logo":
      return `/app/settings?canva=${q}`;
    case "fundraiser_cover":
      return media.target_id ? `/app/fundraisers/${media.target_id}/edit?canva=${q}` : `/app/fundraisers`;
    case "email_inline":
      return media.target_id ? `/app/tidings/email/${media.target_id}` : `/app/tidings/email`;
  }
}

/**
 * Canva return-navigation URL: the user clicked "Return" inside Canva after
 * editing. Verify the correlation JWT (Canva JWKS + audience), re-export the
 * design, and OVERWRITE the media row's stable S3 object — every stored URL
 * updates in place, nothing to rewrite.
 */
export async function GET(req: NextRequest) {
  if (!flags().canva) return NextResponse.json({ error: "not found" }, { status: 404 });
  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const go = (path: string) => NextResponse.redirect(`${base}${path}`, 302);

  const auth = await getAuthContext();
  if (!auth) return go("/app");

  const jwt = req.nextUrl.searchParams.get("correlation_jwt");
  if (!jwt) return go("/app?canva=error");

  let claims: { correlationState: string; designId: string; canvaUserId: string };
  try {
    claims = await verifyCorrelationJwt(jwt);
  } catch (e) {
    console.warn("[canva] correlation_jwt verification failed", e);
    return NextResponse.json({ error: "invalid correlation token" }, { status: 400 });
  }

  // correlation_state is the canva_media id; scoped to the user's ACTIVE org.
  // If they switched orgs mid-edit this misses — documented edge, safe failure.
  const media = await getMediaById(auth.orgId, claims.correlationState);
  if (!media || media.canva_design_id !== claims.designId) return go("/app?canva=error");

  // Defense in depth: the returning Canva identity must be the connected one.
  const conn = await getConnectionByUserId(auth.user.id);
  if (!conn || (claims.canvaUserId && conn.canva_user_id && claims.canvaUserId !== conn.canva_user_id)) {
    return go("/app?canva=error");
  }

  try {
    const token = await getFreshAccessToken(auth.user.id);
    const jobId = await createExport(token, media.canva_design_id);
    const png = await pollExportAndDownload(token, jobId, POLL_BUDGET_MS);
    if (!png) return go(destinationFor(media, "export_timeout"));
    await putPublicImage(media.s3_key, png); // overwrite in place — URL unchanged
    await touchMedia(auth.orgId, media.id);
    return go(destinationFor(media, "updated"));
  } catch (e) {
    if (e instanceof CanvaNotConnectedError) return go("/app/settings?canva=error");
    console.error("[canva] return re-export failed", e);
    return go(destinationFor(media, "export_timeout"));
  }
}
