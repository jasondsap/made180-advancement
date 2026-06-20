import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { getOrgById } from "@/repositories/orgs";
import { listMembersForOrg } from "@/repositories/users";
import { getStripe } from "@/lib/stripe";
import {
  updateOrgCoreAction,
  addMemberAction,
  changeRoleAction,
  removeMemberAction,
  startStripeOnboardingAction,
} from "../actions";

export const dynamic = "force-dynamic";

/** Best-effort Connect status; never let a Stripe hiccup break the page. */
async function stripeStatus(acctId: string | null) {
  if (!acctId) return null;
  try {
    const acct = await getStripe().accounts.retrieve(acctId);
    return { id: acctId, chargesEnabled: acct.charges_enabled, detailsSubmitted: acct.details_submitted };
  } catch {
    return { id: acctId, chargesEnabled: undefined, detailsSubmitted: undefined };
  }
}

export default async function ManageOrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ msg?: string; stripe?: string }>;
}) {
  await requireSuperAdmin();
  const { orgId } = await params;
  const { msg, stripe: stripeReturn } = await searchParams;
  const org = await getOrgById(orgId);
  if (!org) notFound();

  const [members, status] = await Promise.all([
    listMembersForOrg(org.id),
    stripeStatus(org.stripe_account_id),
  ]);
  const a = (org.address_json ?? {}) as Record<string, string>;

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/admin/orgs" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Organizations</Link>
      </p>
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{org.legal_name}</h1>
      <p style={{ color: "#7a7367", margin: ".2rem 0 1.25rem", fontSize: ".9rem" }}>
        <code>/give/{org.slug}</code>
      </p>

      {msg === "created" && <Banner>Organization created. Connect Stripe and add members below.</Banner>}
      {msg === "saved" && <Banner>Changes saved.</Banner>}
      {msg === "member" && <Banner>Member added.</Banner>}
      {stripeReturn === "return" && <Banner>Returned from Stripe onboarding. Status refreshed below.</Banner>}

      {/* Stripe Connect */}
      <Section title="Payments — Stripe Connect">
        {status ? (
          <p style={{ fontSize: ".9rem", margin: "0 0 .75rem" }}>
            Account <code>{status.id}</code>{" "}
            {status.chargesEnabled === true && <span style={{ color: "var(--forest)" }}>· charges enabled ●</span>}
            {status.chargesEnabled === false && <span style={{ color: "#a06b1f" }}>· onboarding incomplete ○</span>}
            {status.chargesEnabled === undefined && <span style={{ color: "#999" }}>· status unavailable</span>}
          </p>
        ) : (
          <p style={{ fontSize: ".9rem", color: "#7a7367", margin: "0 0 .75rem" }}>
            No Stripe account yet. Connect one to enable donations on the giving page.
          </p>
        )}
        <form action={startStripeOnboardingAction}>
          <input type="hidden" name="orgId" value={org.id} />
          <button type="submit" style={btnPrimary}>
            {org.stripe_account_id ? "Continue / manage onboarding" : "Connect Stripe account"}
          </button>
        </form>
      </Section>

      {/* Members */}
      <Section title="Members">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem", marginBottom: ".9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#5a5246" }}>
              <th style={th}>Email</th><th style={th}>Role</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} style={{ borderTop: "1px solid var(--app-border)" }}>
                <td style={td}>
                  {m.email}
                  {m.is_super_admin && <span style={{ marginLeft: ".4rem", fontSize: ".7rem", color: "var(--accent)" }}>super admin</span>}
                </td>
                <td style={td}>
                  <form action={changeRoleAction} style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="userId" value={m.user_id} />
                    <select name="role" defaultValue={m.role} style={sel}>
                      <option value="org_staff">Staff</option>
                      <option value="org_admin">Admin</option>
                    </select>
                    <button type="submit" style={btnGhost}>Update</button>
                  </form>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <form action={removeMemberAction}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="userId" value={m.user_id} />
                    <button type="submit" style={btnDanger}>Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {members.length === 0 && <tr><td style={td} colSpan={3}>No members yet.</td></tr>}
          </tbody>
        </table>

        <form action={addMemberAction} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "end" }}>
          <input type="hidden" name="orgId" value={org.id} />
          <label style={{ display: "grid", gap: ".25rem", fontSize: ".8rem", color: "#555", flex: 1, minWidth: 220 }}>
            Add member by email
            <input name="email" type="email" required placeholder="person@example.org" style={inp} />
          </label>
          <select name="role" defaultValue="org_staff" style={sel}>
            <option value="org_staff">Staff</option>
            <option value="org_admin">Admin</option>
          </select>
          <button type="submit" style={btnPrimary}>Add</button>
        </form>
        <p style={{ fontSize: ".78rem", color: "#999", margin: ".6rem 0 0" }}>
          The user is granted access immediately; their identity binds on first Cognito sign-in (matched by email).
        </p>
      </Section>

      {/* Core details */}
      <Section title="Details">
        <form action={updateOrgCoreAction} style={{ display: "grid", gap: ".75rem" }}>
          <input type="hidden" name="orgId" value={org.id} />
          <Field label="Legal name"><input name="legalName" defaultValue={org.legal_name} style={inp} required /></Field>
          <Field label="EIN"><input name="ein" defaultValue={org.ein ?? ""} style={inp} placeholder="00-0000000" /></Field>
          <Field label="Receipt from-email"><input name="receiptFromEmail" type="email" defaultValue={org.receipt_from_email ?? ""} style={inp} /></Field>
          <Field label="Receipt signatory"><input name="receiptSignatureName" defaultValue={org.receipt_signature_name ?? ""} style={inp} /></Field>
          <Field label="Street"><input name="line1" defaultValue={a.line1 ?? ""} style={inp} /></Field>
          <Field label="Line 2"><input name="line2" defaultValue={a.line2 ?? ""} style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: ".5rem" }}>
            <Field label="City"><input name="city" defaultValue={a.city ?? ""} style={inp} /></Field>
            <Field label="State"><input name="state" defaultValue={a.state ?? ""} style={inp} /></Field>
            <Field label="ZIP"><input name="zip" defaultValue={a.zip ?? ""} style={inp} /></Field>
          </div>
          <div><button type="submit" style={btnPrimary}>Save details</button></div>
        </form>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: "1.1rem", marginBottom: "1rem", background: "#fff" }}>
      <h2 style={{ fontSize: "1.05rem", margin: "0 0 .8rem" }}>{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".25rem", fontSize: ".85rem", color: "#555" }}>{label}{children}</label>;
}
function Banner({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>{children}</div>;
}
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".95rem", width: "100%", boxSizing: "border-box" };
const sel: React.CSSProperties = { padding: ".45rem .5rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".88rem", background: "#fff" };
const th: React.CSSProperties = { padding: ".4rem .5rem", fontWeight: 600, fontSize: ".8rem" };
const td: React.CSSProperties = { padding: ".4rem .5rem", verticalAlign: "middle" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: ".35rem .7rem", borderRadius: 7, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", fontSize: ".82rem", cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: ".35rem .7rem", borderRadius: 7, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".82rem", cursor: "pointer" };
