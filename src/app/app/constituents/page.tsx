import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { listConstituents } from "@/repositories/constituents";
import { rolesForConstituents, KNOWN_ROLES } from "@/repositories/attributes";
import { fmtDate } from "@/lib/format";

const PAGE_SIZE = 50;

export default async function ConstituentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const role = sp.role?.trim() || undefined;
  const rows = await listConstituents(ctx.orgId, {
    search: sp.q,
    role,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const rolesById = await rolesForConstituents(ctx.orgId, rows.map((c) => c.id));

  // Preserve active filters (minus page) across search + pagination links.
  const baseParams = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(role ? { role } : {}), ...extra });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Constituents</h1>
        <Link href="/app/constituents/new" style={btnPrimary}>Add constituent</Link>
      </div>

      <form method="get" style={{ display: "flex", gap: ".5rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name / email / org" style={{ ...inp, flex: 1, minWidth: 220, maxWidth: 360 }} />
        <select name="role" defaultValue={role ?? ""} style={inp} title="Filter by role">
          <option value="">All roles</option>
          {KNOWN_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" style={btn}>Search</button>
        {(sp.q || role) && <Link href="/app/constituents" style={{ ...btn, textDecoration: "none" }}>Clear</Link>}
      </form>

      <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, overflow: "hidden", marginTop: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#777", background: "#fafbfa" }}>
              <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Roles</th><th style={th}>Type</th><th style={th}>Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: "1.5rem", textAlign: "center", color: "#999" }}>No constituents found.</td></tr>}
            {rows.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.org_name || "—";
              const roles = rolesById.get(c.id) ?? [];
              return (
                <tr key={c.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                  <td style={td}><Link href={`/app/constituents/${c.id}`} style={{ color: "var(--brand)", textDecoration: "none" }}>{name}</Link></td>
                  <td style={td}>{c.email ?? "—"}</td>
                  <td style={td}>
                    {roles.length === 0 ? <span style={{ color: "#bbb" }}>—</span> : (
                      <span style={{ display: "flex", gap: ".25rem", flexWrap: "wrap" }}>
                        {roles.map((r) => <span key={r} style={roleChip}>{r}</span>)}
                      </span>
                    )}
                  </td>
                  <td style={td}>{c.type}</td>
                  <td style={td}>{fmtDate(c.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: "1rem", alignItems: "center" }}>
        {page > 1 && <Link href={`/app/constituents?${baseParams({ page: String(page - 1) })}`} style={btn}>← Prev</Link>}
        {rows.length === PAGE_SIZE && <Link href={`/app/constituents?${baseParams({ page: String(page + 1) })}`} style={btn}>Next →</Link>}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: ".6rem .8rem", fontWeight: 600 };
const td: React.CSSProperties = { padding: ".6rem .8rem" };
const inp: React.CSSProperties = { padding: ".45rem .55rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".9rem" };
const btn: React.CSSProperties = { padding: ".45rem .8rem", border: "1px solid #ccc", borderRadius: 7, background: "#fff", fontSize: ".88rem", cursor: "pointer", color: "#333" };
const btnPrimary: React.CSSProperties = { padding: ".5rem .9rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
const roleChip: React.CSSProperties = { background: "#eef4f0", border: "1px solid #cfe0d6", color: "var(--brand)", borderRadius: 99, padding: "1px 8px", fontSize: ".78rem", whiteSpace: "nowrap" };
