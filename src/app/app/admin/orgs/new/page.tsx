import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createOrgAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewOrgPage() {
  await requireSuperAdmin();

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/admin/orgs" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Organizations</Link>
      </p>
      <h1 style={{ fontSize: "1.5rem" }}>New organization</h1>
      <p style={{ color: "#7a7367", fontSize: ".9rem", margin: "0 0 1.25rem" }}>
        Create the tenant, then connect Stripe and add members on the next screen.
      </p>

      <form action={createOrgAction} style={{ display: "grid", gap: "1rem" }}>
        <fieldset style={fs}>
          <legend style={lg}>Organization</legend>
          <Field label="Legal name *"><input name="legalName" style={inp} required placeholder="Riverside Recovery" /></Field>
          <Field label="Slug (public giving URL — leave blank to derive from name)">
            <input name="slug" style={inp} placeholder="riverside-recovery" />
          </Field>
          <Field label="EIN"><input name="ein" style={inp} placeholder="00-0000000" /></Field>
        </fieldset>

        <fieldset style={fs}>
          <legend style={lg}>Receipts (optional now — editable later)</legend>
          <Field label="Receipt from-email (must be Resend-verified)"><input name="receiptFromEmail" type="email" style={inp} /></Field>
          <Field label="Receipt signatory"><input name="receiptSignatureName" style={inp} placeholder="Jane Doe, Executive Director" /></Field>
        </fieldset>

        <div><button type="submit" style={btnPrimary}>Create organization</button></div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".25rem", fontSize: ".85rem", color: "#555" }}>{label}{children}</label>;
}
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".95rem", width: "100%", boxSizing: "border-box" };
const fs: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "1rem", display: "grid", gap: ".75rem" };
const lg: React.CSSProperties = { fontWeight: 600, fontSize: ".85rem", color: "#444", padding: "0 .4rem" };
const btnPrimary: React.CSSProperties = { padding: ".6rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" };
