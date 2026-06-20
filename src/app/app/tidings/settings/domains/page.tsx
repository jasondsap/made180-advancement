import { getAuthContext, canManage } from "@/lib/auth";
import { listDomains } from "@/repositories/engage/domains";
import { Badge } from "@/components/ui/Badge";
import { createDomainAction, verifyDomainAction, deleteDomainAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function DomainsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  const { msg } = await searchParams;
  const domains = await listDomains(ctx.orgId);

  return (
    <Panel title="Email Domains" subtitle="Verify a domain you own so emails send from your address with strong deliverability.">
      {msg === "added" && <p style={{ color: "var(--forest)", fontSize: ".88rem" }}>Domain added. Add the DNS records below, then verify.</p>}

      {domains.map((d) => (
        <div key={d.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{d.domain}</strong>
            <Badge tone={d.verified ? "success" : "warning"}>{d.verified ? "Verified" : "Pending"}</Badge>
          </div>
          {d.dns_records && d.dns_records.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".78rem", marginTop: ".6rem" }}>
              <thead><tr style={{ textAlign: "left", color: "#888" }}><th style={dnsTh}>Type</th><th style={dnsTh}>Host</th><th style={dnsTh}>Value</th></tr></thead>
              <tbody>
                {d.dns_records.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--app-border)" }}>
                    <td style={dnsTd}>{r.type}</td>
                    <td style={dnsTd}><code>{r.host}</code></td>
                    <td style={{ ...dnsTd, wordBreak: "break-all" }}><code>{r.value}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {manage && (
            <div style={{ display: "flex", gap: ".5rem", marginTop: ".6rem" }}>
              {!d.verified && <form action={verifyDomainAction}><input type="hidden" name="id" value={d.id} /><button style={btnGhost}>Check verification</button></form>}
              <form action={deleteDomainAction}><input type="hidden" name="id" value={d.id} /><button style={btnDanger}>Remove</button></form>
            </div>
          )}
        </div>
      ))}
      {domains.length === 0 && <p style={{ color: "#999", fontSize: ".9rem" }}>No domains yet.</p>}

      {manage && (
        <form action={createDomainAction} style={{ display: "flex", gap: ".5rem", marginTop: "1rem", alignItems: "end" }}>
          <label style={{ display: "grid", gap: ".25rem", fontSize: ".82rem", color: "#555", flex: 1 }}>
            Add a domain
            <input name="domain" placeholder="mail.yourorg.org" style={inp} required />
          </label>
          <button style={btnPrimary}>Add domain</button>
        </form>
      )}
    </Panel>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "1.25rem", background: "#fff" }}>
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 .25rem" }}>{title}</h2>
      {subtitle && <p style={{ color: "var(--app-text-soft)", fontSize: ".88rem", margin: "0 0 1rem" }}>{subtitle}</p>}
      {children}
    </section>
  );
}
const card: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: ".9rem", marginBottom: ".75rem" };
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".9rem", width: "100%", boxSizing: "border-box" };
const dnsTh: React.CSSProperties = { padding: ".3rem .4rem", fontWeight: 600 };
const dnsTd: React.CSSProperties = { padding: ".3rem .4rem" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: ".4rem .8rem", borderRadius: 7, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", fontSize: ".82rem", cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: ".4rem .8rem", borderRadius: 7, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".82rem", cursor: "pointer" };
