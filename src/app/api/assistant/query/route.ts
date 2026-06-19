import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { runAssistantQuery } from "@/domain/assistant";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { question } = (await req.json()) as { question?: string };
  if (!question || !question.trim()) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  try {
    const result = await runAssistantQuery(auth.orgId, question.trim());
    return NextResponse.json(result);
  } catch (e) {
    console.error("[assistant] query failed", e);
    return NextResponse.json({ error: "Assistant is unavailable (check ANTHROPIC_API_KEY)." }, { status: 500 });
  }
}
