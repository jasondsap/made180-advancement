import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { flags } from "@/lib/featureFlags";
import { getFreshAccessToken, listDesigns, CanvaNotConnectedError } from "@/lib/canva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List/search the signed-in user's Canva designs (thumbnails for the picker). */
export async function GET(req: NextRequest) {
  if (!flags().canva) return NextResponse.json({ error: "not found" }, { status: 404 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const token = await getFreshAccessToken(auth.user.id);
    const items = await listDesigns(token, req.nextUrl.searchParams.get("query") ?? undefined);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof CanvaNotConnectedError) {
      return NextResponse.json({ error: "not_connected" });
    }
    console.error("[canva] list designs failed", e);
    return NextResponse.json({ error: "Could not load Canva designs." }, { status: 500 });
  }
}
