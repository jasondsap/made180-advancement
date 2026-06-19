import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { listConstituents } from "@/repositories/constituents";
import { fmtDate } from "@/lib/format";

const PAGE_SIZE = 50;

export default async function ConstituentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const rows = await listConstituents(ctx.orgId, {
    search: sp.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Constituents</h1>
        <Link href="/app/constituents/new" style={btnPrimary}>Add constituent</Link>
      </div>

      <form method="get" style={{ display: "flex", gap: ".5rem", marginTop: "1rem" }}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name / email / org" style={{ ...inp, flex: 1, maxWidth: 360 }} />
        <button type="submit" style={btn}>Search</button>
        {sp.q && <Link href="/app/constituents" style={{ ...btn, textDecoration: "none" }}>Clear</Link>}
      </form>

      <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, overflow: "hidden", marginTop: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#777", background: "#fafbfa" }}>
              <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Type</th><th style={th}>Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} style={{ padding: "1.5rem", textAlign: "center", color: "#999" }}>No constituents found.</td></tr>}
            {rows.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.org_name || "—";
              return (
                <tr key={c.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                  <td style={td}><Link href={`/app/constituents/${c.id}`} style={{ color: "#1c6e3c", textDecoration: "none" }}>{name}</Link></td>
                  <td style={td}>{c.email ?? "—"}</td>
                  <td style={td}>{c.type}</td>
                  <td style={td}>{fmtDate(c.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: "1rem", alignItems: "center" }}>
        {page > 1 && <Link href={`/app/constituents?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(page - 1) })}`} style={btn}>← Prev</Link>}
        {rows.length === PAGE_SIZE && <Link href={`/app/constituents?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(page + 1) })}`} style={btn}>Next →</Link>}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: ".6rem .8rem", fontWeight: 600 };
const td: React.CSSProperties = { padding: ".6rem .8rem" };
const inp: React.CSSProperties = { padding: ".45rem .55rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".9rem" };
const btn: React.CSSProperties = { padding: ".45rem .8rem", border: "1px solid #ccc", borderRadius: 7, background: "#fff", fontSize: ".88rem", cursor: "pointer", color: "#333" };
const btnPrimary: React.CSSProperties = { padding: ".5rem .9rem", borderRadius: 8, background: "#1c6e3c", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
