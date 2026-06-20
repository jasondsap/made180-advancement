import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { listFunds } from "@/repositories/funds";
import { createManualGift } from "../actions";

/**
 * Manual gift entry — for checks, in-kind, matching, and stock gifts that don't
 * flow through Stripe. Server component; the form posts straight to a server
 * action (no client JS).
 */
const TYPES: { value: string; label: string }[] = [
  { value: "check", label: "Check" },
  { value: "in_kind", label: "In-kind" },
  { value: "matching", label: "Matching gift" },
  { value: "stock", label: "Stock" },
  { value: "one_time", label: "Cash / other one-time" },
  { value: "pledge", label: "Pledge payment" },
];

export default async function NewGiftPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { error } = await searchParams;
  const funds = await listFunds(ctx.orgId, { activeOnly: true });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/app/gifts" style={{ color: "var(--brand)", textDecoration: "none", fontSize: ".9rem" }}>← Gifts</Link>
      <h1 style={{ fontSize: "1.5rem", margin: ".5rem 0 1rem" }}>Record a gift</h1>

      {error && <div style={banner("#fdecec", "#9b1c1c")}>{error}</div>}

      <form action={createManualGift} style={{ display: "grid", gap: "1rem" }}>
        <fieldset style={fs}>
          <legend style={lg}>Gift</legend>
          <Row>
            <Field label="Type">
              <select name="giftType" defaultValue="check" style={inp} required>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue="succeeded" style={inp}>
                <option value="succeeded">Succeeded</option>
                <option value="pending">Pending</option>
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Amount (USD)">
              <input name="amount" type="number" step="0.01" min="0" placeholder="0.00" style={inp} />
            </Field>
            <Field label="Date received">
              <input name="receivedAt" type="date" defaultValue={today} style={inp} />
            </Field>
          </Row>
          <Field label="Fund">
            <select name="fundId" style={inp}>
              <option value="">— None —</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Notes (e.g. check #, stock shares, matched gift)">
            <input name="notes" style={inp} placeholder="Optional" />
          </Field>
          <Row>
            <Field label="Benefit FMV (USD) — for quid-pro-quo gifts">
              <input name="benefitFmv" type="number" step="0.01" min="0" placeholder="0.00" style={inp} />
            </Field>
            <Field label="Benefit description">
              <input name="benefitDescription" placeholder="e.g. Gala dinner" style={inp} />
            </Field>
          </Row>
          <p style={{ margin: 0, fontSize: ".78rem", color: "#999" }}>
            If the donor received goods/services, enter their fair-market value — the receipt will show the deductible portion.
          </p>
        </fieldset>

        <fieldset style={fs}>
          <legend style={lg}>Donor</legend>
          <p style={{ margin: "0 0 .5rem", fontSize: ".8rem", color: "#888" }}>
            If you enter an email, the donor is matched/deduped to an existing constituent.
          </p>
          <Row>
            <Field label="First name"><input name="firstName" style={inp} /></Field>
            <Field label="Last name"><input name="lastName" style={inp} /></Field>
          </Row>
          <Field label="Organization name (for company/foundation/church donors)">
            <input name="orgName" style={inp} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" style={inp} placeholder="optional" />
          </Field>
          <label style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}>
            <input type="checkbox" name="sendReceipt" /> Email a tax receipt (requires email + succeeded)
          </label>
        </fieldset>

        <div>
          <button type="submit" style={btnPrimary}>Save gift</button>
        </div>
      </form>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: ".25rem", fontSize: ".85rem", color: "#555" }}>
      {label}
      {children}
    </label>
  );
}
function banner(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, padding: ".7rem .9rem", borderRadius: 8, marginBottom: "1rem", fontSize: ".9rem" };
}

const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".95rem", width: "100%", boxSizing: "border-box" };
const fs: React.CSSProperties = { border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", display: "grid", gap: ".75rem" };
const lg: React.CSSProperties = { fontWeight: 600, fontSize: ".85rem", color: "#444", padding: "0 .4rem" };
const btnPrimary: React.CSSProperties = { padding: ".6rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" };
