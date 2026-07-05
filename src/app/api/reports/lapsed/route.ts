import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canManage } from "@/lib/auth";
import { lybunt, sybunt } from "@/repositories/reports";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/reports/lapsed?type=lybunt|sybunt&year=YYYY → CSV so the report leads somewhere. */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const type = req.nextUrl.searchParams.get("type") === "sybunt" ? "sybunt" : "lybunt";
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10) || new Date().getUTCFullYear();
  const rows = type === "sybunt" ? await sybunt(auth.orgId, year) : await lybunt(auth.orgId, year);

  const priorLabel = type === "lybunt" ? `${year - 1} total` : "Prior giving total";
  const lines = [["Name", "Email", priorLabel, "Lifetime total", "Last gift"].join(",")];
  for (const r of rows) {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.org_name || "";
    lines.push([
      csvCell(name),
      csvCell(r.email),
      (r.prior_cents / 100).toFixed(2),
      (r.lifetime_cents / 100).toFixed(2),
      r.last_gift_at ? new Date(r.last_gift_at).toISOString().slice(0, 10) : "",
    ].join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${type}-${year}.csv"`,
    },
  });
}
