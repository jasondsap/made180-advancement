import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { listConstituents } from "@/repositories/constituents";

export const dynamic = "force-dynamic";

/**
 * Typeahead backing for ConstituentPicker. Session-gated and scoped to the
 * caller's active org via getAuthContext — the org id is never read from the
 * request, so a signed-in user of org A cannot search org B.
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const rows = await listConstituents(ctx.orgId, { search: q || undefined, limit: 15 });

  return NextResponse.json({
    results: rows.map((c) => ({
      id: c.id,
      name:
        [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
        c.org_name ||
        c.email ||
        "(unnamed)",
      email: c.email,
    })),
  });
}
