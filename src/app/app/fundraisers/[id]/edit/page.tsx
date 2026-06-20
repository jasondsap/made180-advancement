import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { getFundraiser } from "@/repositories/fundraisers";
import { getOrgById } from "@/repositories/orgs";
import { listFunds } from "@/repositories/funds";
import { listCampaigns } from "@/repositories/campaigns";
import { listTicketTypes } from "@/repositories/ticketTypes";
import { Badge, type Tone } from "@/components/ui/Badge";
import {
  updateFundraiserAction,
  publishFundraiserAction,
  paymentsFundraiserAction,
  pinFundraiserAction,
  duplicateFundraiserAction,
  archiveFundraiserAction,
  addTicketTypeAction,
  updateTicketTypeAction,
  deleteTicketTypeAction,
} from "../../actions";
import type { FundraiserStatus } from "@/types/db";

export const dynamic = "force-dynamic";

const statusTone: Record<FundraiserStatus, Tone> = { unpublished: "neutral", published: "success", ended: "warning", archived: "neutral" };
const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function EditFundraiserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) return <p style={{ color: "#999" }}>Editing fundraisers requires an admin role.</p>;
  const { id } = await params;
  const { msg } = await searchParams;
  const [fr, org, funds, campaigns] = await Promise.all([
    getFundraiser(ctx.orgId, id),
    getOrgById(ctx.orgId),
    listFunds(ctx.orgId, { activeOnly: true }),
    listCampaigns(ctx.orgId),
  ]);
  if (!fr || !org) notFound();

  const tickets = fr.type === "event" ? await listTicketTypes(ctx.orgId, fr.id) : [];
  const theme = fr.theme_json ?? {};
  const amounts = (theme.suggestedAmounts ?? []).map((c) => (c / 100).toString()).join(", ");
  const publicUrl = `/give/${org.slug}/${fr.slug}`;

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/fundraisers" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Fundraisers</Link>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".25rem" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: 0 }}>{fr.title}</h1>
        <Badge tone={statusTone[fr.status]}>{fr.status}</Badge>
      </div>
      <p style={{ color: "#7a7367", fontSize: ".88rem", margin: "0 0 1rem" }}>
        {fr.status === "published"
          ? <a href={publicUrl} target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>{publicUrl} ↗</a>
          : <code>{publicUrl}</code>}
      </p>

      {msg === "created" && <Banner>Fundraiser created. Set its designation and goal, then publish.</Banner>}
      {msg === "saved" && <Banner>Saved.</Banner>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: ".75rem", marginBottom: "1.25rem" }}>
        <Stat label="Raised" value={usd(fr.raised_cents)} />
        <Stat label="Supporters" value={fr.supporter_count} />
        <Stat label="Goal" value={fr.goal_cents != null ? usd(fr.goal_cents) : "—"} />
      </div>

      {/* Status + management controls */}
      <section style={section}>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <form action={publishFundraiserAction}>
            <input type="hidden" name="id" value={fr.id} />
            <input type="hidden" name="publish" value={fr.status === "published" ? "0" : "1"} />
            <button style={btnPrimary}>{fr.status === "published" ? "Unpublish" : "Publish"}</button>
          </form>
          <form action={paymentsFundraiserAction}>
            <input type="hidden" name="id" value={fr.id} />
            <input type="hidden" name="enabled" value={fr.payments_enabled ? "0" : "1"} />
            <button style={btnGhost}>{fr.payments_enabled ? "Disable payments" : "Enable payments"}</button>
          </form>
          <form action={pinFundraiserAction}>
            <input type="hidden" name="id" value={fr.id} />
            <input type="hidden" name="pinned" value={fr.pinned ? "0" : "1"} />
            <button style={btnGhost}>{fr.pinned ? "Unpin" : "Pin to top"}</button>
          </form>
          <form action={duplicateFundraiserAction}>
            <input type="hidden" name="id" value={fr.id} />
            <button style={btnGhost}>Duplicate</button>
          </form>
          <form action={archiveFundraiserAction} style={{ marginLeft: "auto" }}>
            <input type="hidden" name="id" value={fr.id} />
            <button style={btnDanger}>Archive</button>
          </form>
        </div>
      </section>

      {/* Tickets (events only) */}
      {fr.type === "event" && (
        <section style={section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Tickets</h2>
            <Link href={`/app/fundraisers/${fr.id}/registrants`} style={{ color: "var(--brand)", fontSize: ".85rem" }}>View registrants →</Link>
          </div>
          {tickets.map((t) => (
            <form key={t.id} action={updateTicketTypeAction} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .8fr auto auto", gap: ".5rem", alignItems: "center", marginBottom: ".5rem" }}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="fundraiserId" value={fr.id} />
              <input name="name" defaultValue={t.name} style={inp} />
              <input name="price" type="number" min="0" step="1" defaultValue={t.price_cents / 100} style={inp} />
              <input name="capacity" type="number" min="0" defaultValue={t.capacity ?? ""} placeholder="∞" style={inp} title="Capacity (blank = unlimited)" />
              <label style={{ fontSize: ".8rem", display: "flex", gap: ".25rem", alignItems: "center" }}><input type="checkbox" name="active" defaultChecked={t.active} /> active</label>
              <span style={{ display: "inline-flex", gap: ".4rem", alignItems: "center" }}>
                <span style={{ fontSize: ".78rem", color: "#888" }}>{t.sold} sold</span>
                <button style={btnGhost}>Save</button>
              </span>
            </form>
          ))}
          {tickets.length > 0 && (
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: ".75rem" }}>
              {tickets.map((t) => (
                <form key={t.id} action={deleteTicketTypeAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="fundraiserId" value={fr.id} />
                  <button style={btnDangerSm} title={`Remove ${t.name}`}>✕ {t.name}</button>
                </form>
              ))}
            </div>
          )}
          <form action={addTicketTypeAction} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .8fr auto", gap: ".5rem", alignItems: "end", marginTop: ".5rem", borderTop: "1px solid var(--app-border)", paddingTop: ".75rem" }}>
            <input type="hidden" name="fundraiserId" value={fr.id} />
            <Field label="Ticket name"><input name="name" placeholder="General admission" style={inp} required /></Field>
            <Field label="Price ($)"><input name="price" type="number" min="0" step="1" defaultValue="0" style={inp} /></Field>
            <Field label="Capacity"><input name="capacity" type="number" min="0" placeholder="∞" style={inp} /></Field>
            <button style={btnPrimary}>Add ticket</button>
          </form>
        </section>
      )}

      {/* Edit form */}
      <form action={updateFundraiserAction} style={{ ...section, display: "grid", gap: ".9rem" }}>
        <input type="hidden" name="id" value={fr.id} />
        <Field label="Title"><input name="title" defaultValue={fr.title} style={inp} required /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
          <Field label="Fundraising goal ($, optional)"><input name="goal" type="number" min="0" step="1" defaultValue={fr.goal_cents != null ? fr.goal_cents / 100 : ""} style={inp} /></Field>
          <Field label="Accent color (hex, optional)"><input name="accent" defaultValue={theme.accent ?? ""} placeholder={org.primary_color ?? "#6E2A2A"} style={inp} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
          <Field label="Designation (fund)">
            <select name="fundId" defaultValue={fr.fund_id ?? ""} style={inp}>
              <option value="">— Donor chooses —</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Attribute to campaign (optional)">
            <select name="campaignId" defaultValue={fr.campaign_id ?? ""} style={inp}>
              <option value="">— None —</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Suggested amounts ($, comma-separated)"><input name="suggestedAmounts" defaultValue={amounts} placeholder="25, 50, 100, 250" style={inp} /></Field>
        <Field label="Cover image URL (optional)"><input name="coverImageUrl" type="url" defaultValue={theme.coverImageUrl ?? ""} style={inp} /></Field>
        <Field label="Story / description (shown on the page)"><textarea name="story" defaultValue={theme.story ?? ""} style={{ ...inp, minHeight: 140, fontFamily: "var(--font-body)" }} /></Field>
        <div><button style={btnPrimary}>Save</button></div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".3rem", fontSize: ".85rem", color: "#555" }}>{label}{children}</label>;
}
function Banner({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>{children}</div>;
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: ".7rem .9rem", background: "#fff" }}>
      <div style={{ fontSize: ".75rem", color: "#888", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--ink)" }}>{value}</div>
    </div>
  );
}
const section: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 12, padding: "1.1rem", marginBottom: "1rem", background: "#fff" };
const inp: React.CSSProperties = { padding: ".55rem .7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".95rem", width: "100%", boxSizing: "border-box", background: "#fff" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
const btnDangerSm: React.CSSProperties = { padding: ".3rem .6rem", borderRadius: 7, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".78rem", cursor: "pointer" };
