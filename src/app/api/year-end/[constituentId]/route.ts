import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getOrgById } from "@/repositories/orgs";
import { getConstituentById } from "@/repositories/constituents";
import { listGiftsForConstituent } from "@/repositories/gifts";
import { listFunds } from "@/repositories/funds";
import { buildYearEndStatementPdf } from "@/domain/yearEndPdf";

export const runtime = "nodejs";

/** GET /api/year-end/:constituentId?year=YYYY → consolidated annual statement PDF. */
export async function GET(req: NextRequest, ctxArg: { params: Promise<{ constituentId: string }> }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { constituentId } = await ctxArg.params;
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10) || new Date().getUTCFullYear();

  const [org, con, allGifts, funds] = await Promise.all([
    getOrgById(auth.orgId),
    getConstituentById(auth.orgId, constituentId),
    listGiftsForConstituent(auth.orgId, constituentId),
    listFunds(auth.orgId),
  ]);
  if (!org || !con) return NextResponse.json({ error: "not found" }, { status: 404 });

  const fundName = new Map(funds.map((f) => [f.id, f.name]));
  const lines = allGifts
    .filter((g) => g.status === "succeeded" && g.received_at && g.received_at.getUTCFullYear() === year)
    .map((g) => ({
      date: g.received_at as Date,
      fund: g.fund_id ? fundName.get(g.fund_id) ?? null : null,
      amountCents: g.amount_cents,
      deductibleCents: Math.max(0, g.amount_cents - (g.benefit_fmv_cents ?? 0)),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const deductibleCents = lines.reduce((s, l) => s + l.deductibleCents, 0);
  const donorName = [con.first_name, con.last_name].filter(Boolean).join(" ") || con.org_name || "Donor";

  const pdf = buildYearEndStatementPdf({
    org: { legal_name: org.legal_name, ein: org.ein, address_json: org.address_json, receipt_signature_name: org.receipt_signature_name, primary_color: org.primary_color },
    donor: { name: donorName, email: con.email, address: con.address_json },
    year,
    lines,
    totalCents,
    deductibleCents,
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${org.slug}-${year}-statement.pdf"`,
    },
  });
}
