import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { lybunt, sybunt, type LapsedDonor } from "@/repositories/reports";
import { usd, fmtDate } from "@/lib/format";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const year = parseInt(sp.year ?? "", 10) || new Date().getUTCFullYear();

  const [ly, sy] = await Promise.all([lybunt(ctx.orgId, year), sybunt(ctx.orgId, year)]);
  const manage = canManage(ctx.role);

  return (
    <div>
      {manage && (
        <section style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>QuickBooks export</h2>
          <p style={{ color: "#999", fontSize: ".82rem", margin: "0 0 .6rem" }}>Download a CSV of gifts for accounting import (maps funds → accounts in QuickBooks).</p>
          <form method="get" action="/api/export/quickbooks" style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: ".82rem", color: "#666" }}>From <input type="date" name="from" style={{ ...btn, padding: ".35rem .5rem" }} /></label>
            <label style={{ fontSize: ".82rem", color: "#666" }}>To <input type="date" name="to" style={{ ...btn, padding: ".35rem .5rem" }} /></label>
            <select name="status" defaultValue="succeeded" style={{ ...btn, padding: ".4rem .5rem" }}>
              <option value="succeeded">Succeeded</option>
              <option value="">All statuses</option>
              <option value="refunded">Refunded</option>
            </select>
            <button type="submit" style={{ ...btn, background: "#1c6e3c", color: "#fff", border: "none", fontWeight: 600 }}>Download CSV</button>
          </form>
        </section>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Reports</h1>
        <form method="get" style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          <label style={{ fontSize: ".85rem", color: "#666" }}>Reporting year</label>
          <input name="year" type="number" defaultValue={year} style={{ padding: ".4rem .5rem", border: "1px solid #ccc", borderRadius: 7, width: 90 }} />
          <button type="submit" style={btn}>Go</button>
        </form>
      </div>

      <LapseTable
        title={`LYBUNT — gave in ${year - 1}, not yet in ${year}`}
        subtitle="Last Year But Unfortunately Not This. Prime re-solicitation list."
        rows={ly}
        priorLabel={`${year - 1} total`}
      />
      <LapseTable
        title={`SYBUNT — gave before ${year}, not yet in ${year}`}
        subtitle="Some Year But Unfortunately Not This. Lapsed donors worth a win-back."
        rows={sy}
        priorLabel="Prior total"
      />
    </div>
  );
}

function LapseTable({ title, subtitle, rows, priorLabel }: { title: string; subtitle: string; rows: LapsedDonor[]; priorLabel: string }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", marginTop: "1.25rem" }}>
      <h2 style={{ fontSize: "1.05rem", margin: "0 0 .15rem" }}>{title}</h2>
      <p style={{ color: "#999", fontSize: ".82rem", margin: "0 0 .75rem" }}>{subtitle} · {rows.length} donor{rows.length === 1 ? "" : "s"}</p>
      {rows.length === 0 ? (
        <p style={{ color: "#999", fontSize: ".9rem" }}>None 🎉</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead><tr style={{ textAlign: "left", color: "#888" }}>
            <th style={td}>Donor</th><th style={td}>Email</th><th style={{ ...td, textAlign: "right" }}>{priorLabel}</th><th style={{ ...td, textAlign: "right" }}>Lifetime</th><th style={td}>Last gift</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.org_name || "—";
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                  <td style={td}><Link href={`/app/constituents/${r.id}`} style={{ color: "#1c6e3c", textDecoration: "none" }}>{name}</Link></td>
                  <td style={td}>{r.email ?? "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{usd(r.prior_cents)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{usd(r.lifetime_cents)}</td>
                  <td style={td}>{fmtDate(r.last_gift_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

const td: React.CSSProperties = { padding: ".45rem .4rem" };
const btn: React.CSSProperties = { padding: ".4rem .8rem", border: "1px solid #ccc", borderRadius: 7, background: "#fff", fontSize: ".88rem", cursor: "pointer" };
