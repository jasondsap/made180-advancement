import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { draftThankYou } from "@/domain/assistant";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rl = await rateLimit(`assistant:${auth.user.id}`, { limit: 20, windowSecs: 60 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSecs);
  const { giftId } = (await req.json()) as { giftId?: string };
  if (!giftId) return NextResponse.json({ error: "missing giftId" }, { status: 400 });
  try {
    const draft = await draftThankYou(auth.orgId, giftId);
    return NextResponse.json({ draft });
  } catch (e) {
    console.error("[assistant] thank-you failed", e);
    return NextResponse.json({ error: "Could not draft (check ANTHROPIC_API_KEY)." }, { status: 500 });
  }
}
