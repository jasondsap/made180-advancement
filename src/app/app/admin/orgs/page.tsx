import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { listAllOrgs } from "@/repositories/orgs";
import { listRecentWebhookErrors } from "@/repositories/webhookEvents";

export const dynamic = "force-dynamic";

export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const [orgs, webhookErrors] = await Promise.all([listAllOrgs(), listRecentWebhookErrors()]);

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Organizations</h1>
          <p style={{ color: "#7a7367", margin: ".25rem 0 0", fontSize: ".9rem" }}>
            Every tenant on the platform. {orgs.length} total.
          </p>
        </div>
        <Link href="/app/admin/orgs/new" style={btnPrimary}>+ New organization</Link>
      </div>

      <div style={{ border: "1px solid var(--app-border)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".92rem" }}>
          <thead>
            <tr style={{ background: "var(--parchment-deep)", textAlign: "left" }}>
              <th style={th}>Organization</th>
              <th style={th}>Slug</th>
              <th style={th}>EIN</th>
              <th style={th}>Donations</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid var(--app-border)" }}>
                <td style={td}>
                  <Link href={`/app/admin/orgs/${o.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                    {o.legal_name}
                  </Link>
                </td>
                <td style={td}><code>{o.slug}</code></td>
                <td style={td}>{o.ein ?? "—"}</td>
                <td style={td}>
                  {o.stripe_account_id
                    ? <span style={{ color: "var(--forest)" }}>● Connected</span>
                    : <span style={{ color: "#a06b1f" }}>○ Not connected</span>}
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr><td style={td} colSpan={4}>No organizations yet. Create the first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Platform health: Stripe webhook events that failed processing. Stripe's
          retries re-claim these automatically; anything lingering needs a human. */}
      {webhookErrors.length > 0 && (
        <div style={{ marginTop: "1.5rem", border: "1px solid #e6c3c0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <div style={{ background: "#fdecec", color: "#9b1c1c", padding: ".6rem .8rem", fontWeight: 600, fontSize: ".9rem" }}>
            ⚠ {webhookErrors.length} Stripe webhook event(s) failed processing
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={th}>When</th><th style={th}>Event</th><th style={th}>Type</th><th style={th}>Error</th>
              </tr>
            </thead>
            <tbody>
              {webhookErrors.map((e) => (
                <tr key={e.stripe_event_id} style={{ borderTop: "1px solid var(--app-border)" }}>
                  <td style={td}>{new Date(e.created_at).toLocaleString()}</td>
                  <td style={td}><code style={{ fontSize: ".78rem" }}>{e.stripe_event_id}</code></td>
                  <td style={td}>{e.type ?? "—"}</td>
                  <td style={{ ...td, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.handler_error ?? ""}>{e.handler_error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: ".78rem", color: "#7a7367", padding: ".5rem .8rem", margin: 0 }}>
            Stripe retries failed events automatically (they re-claim on delivery). If a row persists past a day,
            use the Stripe dashboard&apos;s “Resend event” on this endpoint after fixing the cause.
          </p>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: ".6rem .8rem", fontWeight: 600, fontSize: ".82rem", color: "#5a5246" };
const td: React.CSSProperties = { padding: ".6rem .8rem" };
const btnPrimary: React.CSSProperties = { padding: ".55rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
