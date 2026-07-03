import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getAuthContext, canManage } from "@/lib/auth";
import { flags } from "@/lib/featureFlags";
import { putPublicImage } from "@/lib/s3";
import {
  getFreshAccessToken,
  createExport,
  pollExportAndDownload,
  CanvaNotConnectedError,
} from "@/lib/canva";
import { insertMedia, TARGET_KINDS, type CanvaTargetKind } from "@/repositories/canvaMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Amplify SSR compute caps around ~30s — poll well under it and hand the job
// back to the client (202) to continue.
const POLL_BUDGET_MS = 15_000;

/**
 * Export a Canva design to PNG, copy it to our S3 media bucket (stable key),
 * and record a canva_media row. Long exports: 202 { jobId } → client re-POSTs
 * the same body plus jobId to continue.
 */
export async function POST(req: NextRequest) {
  if (!flags().canva) return NextResponse.json({ error: "not found" }, { status: 404 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    designId?: string;
    targetKind?: string;
    targetId?: string | null;
    jobId?: string;
  };
  const targetKind = body.targetKind as CanvaTargetKind;
  if (!body.designId || !TARGET_KINDS.includes(targetKind)) {
    return NextResponse.json({ error: "missing designId/targetKind" }, { status: 400 });
  }
  const targetId = body.targetId && UUID_RE.test(body.targetId) ? body.targetId : null;

  try {
    const token = await getFreshAccessToken(auth.user.id);
    const jobId = body.jobId || (await createExport(token, body.designId));
    const png = await pollExportAndDownload(token, jobId, POLL_BUDGET_MS);
    if (!png) return NextResponse.json({ jobId }, { status: 202 });

    const mediaId = randomUUID();
    const s3Key = `canva/${auth.orgId}/${mediaId}.png`;
    const url = await putPublicImage(s3Key, png);
    await insertMedia(auth.orgId, {
      id: mediaId,
      canvaDesignId: body.designId,
      s3Key,
      url,
      targetKind,
      targetId,
      createdBy: auth.user.id,
    });
    return NextResponse.json({ url, mediaId });
  } catch (e) {
    if (e instanceof CanvaNotConnectedError) {
      return NextResponse.json({ error: "not_connected" });
    }
    console.error("[canva] export failed", e);
    return NextResponse.json({ error: "Export from Canva failed." }, { status: 500 });
  }
}
