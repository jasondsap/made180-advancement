import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { listFundraisers } from "@/repositories/fundraisers";

/** CSV export of the org's fundraisers with derived raised/supporter totals. */
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await listFundraisers(ctx.orgId, { includeArchived: true });
  const header = ["Title", "Type", "Status", "Supporters", "Raised (USD)", "Goal (USD)", "Slug", "Created"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.title),
      r.type,
      r.status,
      r.supporter_count,
      (r.raised_cents / 100).toFixed(2),
      r.goal_cents != null ? (r.goal_cents / 100).toFixed(2) : "",
      csvCell(r.slug),
      new Date(r.created_at).toISOString().slice(0, 10),
    ].join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fundraisers.csv"`,
    },
  });
}
