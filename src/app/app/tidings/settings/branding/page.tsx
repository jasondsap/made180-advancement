import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getOrgById } from "@/repositories/orgs";

export const dynamic = "force-dynamic";

/**
 * Engage branding is the same org logo + accent color used on giving pages and
 * receipts (set in Settings). Emails render with these automatically, so this
 * panel previews them rather than maintaining a second source of truth.
 */
export default async function EngageBrandingPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const org = await getOrgById(ctx.orgId);
  if (!org) return null;
  const accent = org.primary_color || "#6E2A2A";

  return (
    <section style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "1.25rem", background: "#fff" }}>
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 .25rem" }}>Branding</h2>
      <p style={{ color: "var(--app-text-soft)", fontSize: ".88rem", margin: "0 0 1rem" }}>
        Your logo and accent color appear at the top of every email. These are shared with your giving page and receipts.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        <div>
          <div style={{ fontSize: ".8rem", color: "#888", marginBottom: ".4rem" }}>Current logo</div>
          {org.logo_url
            ? <img src={org.logo_url} alt="logo" style={{ maxHeight: 56, maxWidth: 200 }} />
            : <span style={{ fontSize: ".9rem", color: "#999" }}>No logo set</span>}
        </div>
        <div>
          <div style={{ fontSize: ".8rem", color: "#888", marginBottom: ".4rem" }}>Accent color</div>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
            <span style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #ccc", background: accent, display: "inline-block" }} />
            <code>{accent}</code>
          </div>
        </div>
      </div>

      {/* Mini email-header preview */}
      <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--app-border)", paddingTop: "1rem" }}>
        <div style={{ fontSize: ".8rem", color: "#888", marginBottom: ".5rem" }}>Email header preview</div>
        <div style={{ border: "1px solid var(--app-border)", borderRadius: 8, overflow: "hidden", maxWidth: 420 }}>
          <div style={{ borderTop: `4px solid ${accent}`, padding: "1rem", fontWeight: 600, color: accent }}>
            {org.logo_url ? <img src={org.logo_url} alt="" style={{ maxHeight: 40 }} /> : org.legal_name}
          </div>
        </div>
      </div>

      <p style={{ marginTop: "1.25rem", fontSize: ".88rem" }}>
        <Link href="/app/settings" style={{ color: "var(--brand)" }}>Edit logo &amp; color in Settings →</Link>
      </p>
    </section>
  );
}
