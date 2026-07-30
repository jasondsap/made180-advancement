import { getAuthContext, canManage } from "@/lib/auth";
import { listSenders } from "@/repositories/engage/senders";
import { listDomains } from "@/repositories/engage/domains";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { createSenderAction, setDefaultSenderAction, deleteSenderAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SendersPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  const [senders, domains] = await Promise.all([listSenders(ctx.orgId), listDomains(ctx.orgId)]);
  const verified = domains.filter((d) => d.verified);

  return (
    <section style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "1.25rem", background: "#fff" }}>
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 .25rem" }}>Email Senders</h2>
      <p style={{ color: "var(--app-text-soft)", fontSize: ".88rem", margin: "0 0 1rem" }}>The From name and address donors see.</p>

      {verified.length === 0 ? (
        <EmptyState title="Add a domain first" description="You need a verified email domain before you can create senders." />
      ) : (
        <>
          {senders.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--app-border)", borderRadius: 10, padding: ".75rem .9rem", marginBottom: ".6rem" }}>
              <div>
                <strong>{s.from_name}</strong> <span style={{ color: "#888" }}>&lt;{s.from_email}&gt;</span>
                {s.is_default && <span style={{ marginLeft: ".5rem" }}><Badge tone="info">Default</Badge></span>}
              </div>
              {manage && (
                <div style={{ display: "flex", gap: ".4rem" }}>
                  {!s.is_default && <form action={setDefaultSenderAction}><input type="hidden" name="id" value={s.id} /><button style={btnGhost}>Make default</button></form>}
                  <form action={deleteSenderAction}><input type="hidden" name="id" value={s.id} /><button style={btnDanger}>Remove</button></form>
                </div>
              )}
            </div>
          ))}

          {manage && (
            <form action={createSenderAction} style={{ display: "grid", gap: ".6rem", marginTop: "1rem", maxWidth: 460 }}>
              <input name="fromName" placeholder="From name (e.g. Riverside Recovery)" style={inp} required />
              <input name="fromEmail" type="email" placeholder="hello@yourdomain.org (on a verified domain)" style={inp} required />
              <input name="replyTo" type="email" placeholder="Reply-to (optional)" style={inp} />
              <label style={{ fontSize: ".88rem", display: "flex", gap: ".5rem", alignItems: "center" }}><input type="checkbox" name="isDefault" /> Set as default</label>
              <div><button style={btnPrimary}>Add sender</button></div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".9rem", width: "100%", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: ".4rem .8rem", borderRadius: 7, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", fontSize: ".82rem", cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: ".4rem .8rem", borderRadius: 7, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".82rem", cursor: "pointer" };
