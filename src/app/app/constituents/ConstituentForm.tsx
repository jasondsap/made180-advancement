import type { Constituent } from "@/types/db";

/** Shared add/edit form. Server component — posts directly to a server action. */
export function ConstituentForm({
  action,
  defaults,
  submitLabel,
  error,
}: {
  action: (fd: FormData) => void | Promise<void>;
  defaults?: Partial<Constituent> | null;
  submitLabel: string;
  error?: string;
}) {
  const a = (defaults?.address_json ?? {}) as Record<string, string>;
  return (
    <form action={action} style={{ display: "grid", gap: "1rem", maxWidth: 640 }}>
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}
      {error && <div style={{ background: "#fdecec", color: "#9b1c1c", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem" }}>{error}</div>}

      <fieldset style={fs}>
        <legend style={lg}>Identity</legend>
        <Field label="Type">
          <select name="type" defaultValue={defaults?.type ?? "individual"} style={inp}>
            <option value="individual">Individual</option>
            <option value="organization">Organization</option>
          </select>
        </Field>
        <Row>
          <Field label="First name"><input name="firstName" defaultValue={defaults?.first_name ?? ""} style={inp} /></Field>
          <Field label="Last name"><input name="lastName" defaultValue={defaults?.last_name ?? ""} style={inp} /></Field>
        </Row>
        <Field label="Organization name"><input name="orgName" defaultValue={defaults?.org_name ?? ""} style={inp} /></Field>
        <Row>
          <Field label="Email"><input name="email" type="email" defaultValue={defaults?.email ?? ""} style={inp} /></Field>
          <Field label="Phone"><input name="phone" defaultValue={defaults?.phone ?? ""} style={inp} /></Field>
        </Row>
        {defaults?.id && (
          <label style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}>
            <input type="checkbox" name="doNotContact" defaultChecked={defaults?.do_not_contact ?? false} /> Do not contact
          </label>
        )}
      </fieldset>

      <fieldset style={fs}>
        <legend style={lg}>Address</legend>
        <Field label="Street"><input name="line1" defaultValue={a.line1 ?? ""} style={inp} /></Field>
        <Field label="Line 2"><input name="line2" defaultValue={a.line2 ?? ""} style={inp} /></Field>
        <Row>
          <Field label="City"><input name="city" defaultValue={a.city ?? ""} style={inp} /></Field>
          <Field label="State"><input name="state" defaultValue={a.state ?? ""} style={inp} /></Field>
          <Field label="ZIP"><input name="zip" defaultValue={a.zip ?? ""} style={inp} /></Field>
        </Row>
      </fieldset>

      <div><button type="submit" style={btnPrimary}>{submitLabel}</button></div>
    </form>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: ".75rem" }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".25rem", fontSize: ".85rem", color: "#555" }}>{label}{children}</label>;
}

const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".95rem", width: "100%", boxSizing: "border-box" };
const fs: React.CSSProperties = { border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", display: "grid", gap: ".75rem" };
const lg: React.CSSProperties = { fontWeight: 600, fontSize: ".85rem", color: "#444", padding: "0 .4rem" };
const btnPrimary: React.CSSProperties = { padding: ".6rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" };
