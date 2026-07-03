import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { flags } from "@/lib/featureFlags";
import { getOrgById } from "@/repositories/orgs";
import { getConnectionByUserId } from "@/repositories/canvaConnections";
import { getMediaByUrl } from "@/repositories/canvaMedia";
import { CanvaImageField } from "@/components/canva/CanvaImageField";
import { updateOrgAction, disconnectCanvaAction } from "./actions";

const CANVA_BANNERS: Record<string, { text: string; tone: "ok" | "err" }> = {
  connected: { text: "Canva connected. Look for “Design with Canva” on image fields.", tone: "ok" },
  disconnected: { text: "Canva disconnected.", tone: "ok" },
  updated: { text: "Design updated from Canva.", tone: "ok" },
  denied: { text: "Canva connection was declined.", tone: "err" },
  error: { text: "Canva connection failed — please try again.", tone: "err" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; canva?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { msg, canva } = await searchParams;
  const org = await getOrgById(ctx.orgId);
  if (!org) return null;
  const manage = canManage(ctx.role);
  const a = (org.address_json ?? {}) as Record<string, string>;
  const canvaEnabled = flags().canva;
  const canvaConn = canvaEnabled ? await getConnectionByUserId(ctx.user.id) : undefined;
  const canvaBanner = canva ? CANVA_BANNERS[canva] : undefined;
  const logoMedia =
    canvaEnabled && org.logo_url ? await getMediaByUrl(ctx.orgId, org.logo_url) : undefined;

  if (!manage) {
    return <div><h1 style={{ fontSize: "1.5rem" }}>Settings</h1><p style={{ color: "#999" }}>Settings require an admin role.</p></div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Settings</h1>
      {msg === "saved" && <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>Settings saved.</div>}
      {canvaBanner && (
        <div style={{ background: canvaBanner.tone === "ok" ? "#edf1ec" : "#fbeceb", color: canvaBanner.tone === "ok" ? "var(--forest)" : "#9b1c1c", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>
          {canvaBanner.text}
        </div>
      )}

      <form action={updateOrgAction} style={{ display: "grid", gap: "1rem" }}>
        <fieldset style={fs}>
          <legend style={lg}>Organization</legend>
          <Field label="Legal name"><input name="legalName" defaultValue={org.legal_name} style={inp} required /></Field>
          <Field label="EIN"><input name="ein" defaultValue={org.ein ?? ""} style={inp} placeholder="00-0000000" /></Field>
        </fieldset>

        <fieldset style={fs}>
          <legend style={lg}>Receipts</legend>
          <Field label="Receipt from-email (must be Resend-verified)"><input name="receiptFromEmail" type="email" defaultValue={org.receipt_from_email ?? ""} style={inp} /></Field>
          <Field label="Receipt signatory"><input name="receiptSignatureName" defaultValue={org.receipt_signature_name ?? ""} style={inp} placeholder="Jane Doe, Executive Director" /></Field>
        </fieldset>

        <fieldset style={fs}>
          <legend style={lg}>Branding (public giving page &amp; receipts)</legend>
          <Field label="Logo URL (absolute https:// link, shown on your giving page)">
            <CanvaImageField
              name="logoUrl"
              defaultValue={org.logo_url ?? ""}
              placeholder="https://example.org/logo.png"
              targetKind="org_logo"
              targetId={org.id}
              initialMediaId={logoMedia?.id ?? null}
              canvaEnabled={canvaEnabled}
              canvaConnected={Boolean(canvaConn)}
            />
          </Field>
          <Field label="Primary color (hex, e.g. #1c6e3c — defaults to Almonry oxblood)">
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <input name="primaryColor" defaultValue={org.primary_color ?? ""} style={{ ...inp, flex: 1 }} placeholder="#1c6e3c" />
              {org.primary_color && <span aria-hidden style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #ccc", background: org.primary_color, display: "inline-block" }} />}
            </div>
          </Field>
        </fieldset>

        <fieldset style={fs}>
          <legend style={lg}>Mailing address (receipt letterhead)</legend>
          <Field label="Street"><input name="line1" defaultValue={a.line1 ?? ""} style={inp} /></Field>
          <Field label="Line 2"><input name="line2" defaultValue={a.line2 ?? ""} style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: ".5rem" }}>
            <Field label="City"><input name="city" defaultValue={a.city ?? ""} style={inp} /></Field>
            <Field label="State"><input name="state" defaultValue={a.state ?? ""} style={inp} /></Field>
            <Field label="ZIP"><input name="zip" defaultValue={a.zip ?? ""} style={inp} /></Field>
          </div>
        </fieldset>

        <div><button type="submit" style={btnPrimary}>Save settings</button></div>
      </form>

      {canvaEnabled && (
        <section style={{ ...fs, marginTop: "1rem" }}>
          <legend style={lg}>Integrations</legend>
          {canvaConn ? (
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
              <p style={{ fontSize: ".9rem", margin: 0, flex: 1 }}>
                <strong>Canva</strong> — connected as {canvaConn.display_name ?? "your Canva account"}. “Design with
                Canva” is available on image fields.
              </p>
              <form action={disconnectCanvaAction}>
                <button type="submit" style={{ padding: ".4rem .8rem", border: "1px solid #ccc", borderRadius: 6, background: "#fff", fontSize: ".85rem", cursor: "pointer" }}>
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
              <p style={{ fontSize: ".9rem", margin: 0, flex: 1 }}>
                <strong>Canva</strong> — design campaign covers, logos, and email graphics without leaving Almonry.
                Connects your personal Canva account.
              </p>
              <a href="/api/canva/connect" style={{ ...btnPrimary, textDecoration: "none", display: "inline-block" }}>
                Connect Canva
              </a>
            </div>
          )}
        </section>
      )}

      <section style={{ ...fs, marginTop: "1rem" }}>
        <legend style={lg}>Manage</legend>
        <p style={{ fontSize: ".9rem", margin: ".25rem 0" }}>
          <Link href="/app/funds" style={{ color: "var(--brand)" }}>Funds</Link> · <Link href="/app/campaigns" style={{ color: "var(--brand)" }}>Campaigns & appeals</Link>
        </p>
        <p style={{ fontSize: ".8rem", color: "#999", margin: 0 }}>
          User & role management is provisioned via Cognito + the memberships table. Connect onboarding lives under your org&apos;s Stripe settings.
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".25rem", fontSize: ".85rem", color: "#555" }}>{label}{children}</label>;
}
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".95rem", width: "100%", boxSizing: "border-box" };
const fs: React.CSSProperties = { border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", display: "grid", gap: ".75rem" };
const lg: React.CSSProperties = { fontWeight: 600, fontSize: ".85rem", color: "#444", padding: "0 .4rem" };
const btnPrimary: React.CSSProperties = { padding: ".6rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" };
