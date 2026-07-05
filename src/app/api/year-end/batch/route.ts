import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canManage } from "@/lib/auth";
import { getOrgById } from "@/repositories/orgs";
import { listSucceededGiftsForYear } from "@/repositories/gifts";
import { buildYearEndBatchPdf, type YearEndData } from "@/domain/yearEndPdf";
import type { AddressJson } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/year-end/batch?year=YYYY — one printable PDF containing an annual
 * giving statement for EVERY donor with succeeded gifts that year (one
 * page-set per donor, sorted by name). The January statement run.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10) || new Date().getUTCFullYear() - 1;
  const org = await getOrgById(auth.orgId);
  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 });

  const rows = await listSucceededGiftsForYear(auth.orgId, year);
  if (rows.length === 0) {
    return NextResponse.json({ error: `No succeeded gifts found in ${year}.` }, { status: 404 });
  }

  // Group rows into one statement per donor (rows arrive donor-sorted).
  const orgBlock = {
    legal_name: org.legal_name,
    ein: org.ein,
    address_json: org.address_json,
    receipt_signature_name: org.receipt_signature_name,
    primary_color: org.primary_color,
  };
  const byDonor = new Map<string, YearEndData>();
  for (const r of rows) {
    let s = byDonor.get(r.constituent_id);
    if (!s) {
      const name = [r.donor_first, r.donor_last].filter(Boolean).join(" ") || r.donor_org || r.donor_email || "Donor";
      s = {
        org: orgBlock,
        donor: { name, email: r.donor_email, address: (r.donor_address as AddressJson | null) ?? null },
        year,
        lines: [],
        totalCents: 0,
        deductibleCents: 0,
      };
      byDonor.set(r.constituent_id, s);
    }
    const deductible = Math.max(0, r.amount_cents - (r.benefit_fmv_cents ?? 0));
    s.lines.push({ date: new Date(r.received_at), fund: r.fund_name, amountCents: r.amount_cents, deductibleCents: deductible });
    s.totalCents += r.amount_cents;
    s.deductibleCents += deductible;
  }

  const pdf = buildYearEndBatchPdf([...byDonor.values()]);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${org.slug}-${year}-statements.pdf"`,
    },
  });
}
