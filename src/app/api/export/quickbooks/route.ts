import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canManage } from "@/lib/auth";
import { exportGifts } from "@/repositories/gifts";
import { buildQuickBooksCsv } from "@/domain/quickbooksCsv";

export const runtime = "nodejs";

/** GET /api/export/quickbooks?from=&to=&fund=&status= → gifts CSV for QuickBooks. */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams;
  const rows = await exportGifts(auth.orgId, {
    fundId: q.get("fund") || null,
    status: q.get("status") || "succeeded",
    dateFrom: q.get("from") || null,
    dateTo: q.get("to") || null,
  });

  const csv = buildQuickBooksCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gifts-export-${stamp}.csv"`,
    },
  });
}
