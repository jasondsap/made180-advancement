import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { getConstituentById } from "@/repositories/constituents";
import { constituentLtv, listGiftsForConstituent } from "@/repositories/gifts";
import { listRecurringPlansForConstituent } from "@/repositories/recurringPlans";
import { listRoles, KNOWN_ROLES } from "@/repositories/attributes";
import { listRelationships, REL_TYPES } from "@/repositories/relationships";
import { usd, fmtDate } from "@/lib/format";
import {
  addRoleAction, removeRoleAction, addRelationshipAction, removeRelationshipAction, mergeAction,
} from "../actions";

const MSGS: Record<string, [string, string, string]> = {
  saved: ["#e8f5ec", "#1c6e3c", "Saved."],
  merged: ["#e8f5ec", "#1c6e3c", "Constituents merged."],
  merge_notfound: ["#fdecec", "#9b1c1c", "Couldn't find that constituent to merge."],
  merge_self: ["#fff4e5", "#7a4f00", "Can't merge a constituent into itself."],
  merge_error: ["#fdecec", "#9b1c1c", "Merge failed."],
  rel_notfound: ["#fdecec", "#9b1c1c", "Related constituent not found."],
  rel_error: ["#fdecec", "#9b1c1c", "Could not add relationship."],
  rel_added: ["#e8f5ec", "#1c6e3c", "Relationship added."],
};

export default async function ConstituentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { msg } = await searchParams;

  const con = await getConstituentById(ctx.orgId, id);
  if (!con) notFound();

  const [ltv, gifts, plans, roles, rels] = await Promise.all([
    constituentLtv(ctx.orgId, id),
    listGiftsForConstituent(ctx.orgId, id),
    listRecurringPlansForConstituent(ctx.orgId, id),
    listRoles(ctx.orgId, id),
    listRelationships(ctx.orgId, id),
  ]);

  const name = [con.first_name, con.last_name].filter(Boolean).join(" ") || con.org_name || con.email || "Constituent";
  const addr = (con.address_json ?? {}) as Record<string, string>;
  const banner = msg ? MSGS[msg] : undefined;

  return (
    <div style={{ maxWidth: 820 }}>
      <Link href="/app/constituents" style={{ color: "#1c6e3c", textDecoration: "none", fontSize: ".9rem" }}>← Constituents</Link>
      {banner && <div style={{ background: banner[0], color: banner[1], padding: ".7rem .9rem", borderRadius: 8, margin: ".75rem 0", fontSize: ".9rem" }}>{banner[2]}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: ".75rem", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>{name}</h1>
        <Link href={`/app/constituents/${id}/edit`} style={btn}>Edit</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: "1rem", marginTop: "1rem" }}>
        <section style={card}>
          <H>Details</H>
          <Row k="Type" v={con.type} />
          <Row k="Email" v={con.email ?? "—"} />
          <Row k="Phone" v={con.phone ?? "—"} />
          <Row k="Address" v={[addr.line1, addr.line2, [addr.city, addr.state, addr.zip].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"} />
          <Row k="Do not contact" v={con.do_not_contact ? "Yes" : "No"} />
          <Row k="Source" v={con.source ?? "—"} />
        </section>
        <section style={card}>
          <H>Lifetime value</H>
          <Row k="Total given" v={<strong>{usd(ltv.totalCents)}</strong>} />
          <Row k="Gifts" v={String(ltv.giftCount)} />
          <Row k="First gift" v={fmtDate(ltv.firstGiftAt)} />
          <Row k="Last gift" v={fmtDate(ltv.lastGiftAt)} />
        </section>
      </div>

      {/* Roles */}
      <section style={{ ...card, marginTop: "1rem" }}>
        <H>Roles</H>
        <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", alignItems: "center" }}>
          {roles.length === 0 && <span style={{ color: "#999", fontSize: ".88rem" }}>No roles assigned.</span>}
          {roles.map((r) => (
            <form key={r} action={removeRoleAction} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="role" value={r} />
              <button type="submit" title="Remove" style={chip}>{r} ✕</button>
            </form>
          ))}
        </div>
        <form action={addRoleAction} style={{ display: "flex", gap: ".5rem", marginTop: ".75rem" }}>
          <input type="hidden" name="id" value={id} />
          <input name="role" list="known-roles" placeholder="Add role" style={inp} />
          <datalist id="known-roles">{KNOWN_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          <button type="submit" style={btn}>Add</button>
        </form>
      </section>

      {/* Relationships */}
      <section style={{ ...card, marginTop: "1rem" }}>
        <H>Relationships</H>
        {rels.length === 0 && <p style={{ color: "#999", fontSize: ".88rem", margin: 0 }}>No relationships.</p>}
        {rels.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".3rem 0", fontSize: ".9rem" }}>
            <span><Link href={`/app/constituents/${r.other_id}`} style={{ color: "#1c6e3c" }}>{r.other_name}</Link> <span style={{ color: "#999" }}>· {r.rel_type}</span></span>
            <form action={removeRelationshipAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="relId" value={r.id} />
              <button type="submit" style={linkBtn}>remove</button>
            </form>
          </div>
        ))}
        <form action={addRelationshipAction} style={{ display: "flex", gap: ".5rem", marginTop: ".75rem", flexWrap: "wrap" }}>
          <input type="hidden" name="id" value={id} />
          <input name="other" placeholder="Other constituent's email" style={{ ...inp, flex: 1, minWidth: 200 }} />
          <select name="relType" style={inp}>{REL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <button type="submit" style={btn}>Link</button>
        </form>
      </section>

      {/* Recurring plans */}
      {plans.length > 0 && (
        <section style={{ ...card, marginTop: "1rem" }}>
          <H>Recurring plans</H>
          {plans.map((p) => (
            <Row key={p.id} k={`${usd(p.amount_cents)} / ${p.interval}`} v={`${p.status}${p.canceled_at ? ` (canceled ${fmtDate(p.canceled_at)})` : ""}`} />
          ))}
        </section>
      )}

      {/* Gift history */}
      <section style={{ ...card, marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <H>Gift history ({gifts.length})</H>
          <a href={`/api/year-end/${id}?year=${new Date().getUTCFullYear()}`} target="_blank" rel="noreferrer" style={{ color: "#1c6e3c", fontSize: ".85rem", textDecoration: "none" }}>
            Year-end statement ↗
          </a>
        </div>
        {gifts.length === 0 ? <p style={{ color: "#999", fontSize: ".88rem", margin: 0 }}>No gifts.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
            <thead><tr style={{ textAlign: "left", color: "#888" }}><th style={td}>Date</th><th style={td}>Type</th><th style={{ ...td, textAlign: "right" }}>Amount</th><th style={td}>Status</th></tr></thead>
            <tbody>
              {gifts.map((g) => (
                <tr key={g.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                  <td style={td}><Link href={`/app/gifts/${g.id}`} style={{ color: "#1c6e3c", textDecoration: "none" }}>{fmtDate(g.received_at)}</Link></td>
                  <td style={td}>{g.gift_type}</td>
                  <td style={{ ...td, textAlign: "right" }}>{usd(g.amount_cents)}</td>
                  <td style={td}>{g.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Merge tool */}
      {canManage(ctx.role) && (
        <section style={{ ...card, marginTop: "1rem", borderColor: "#e0d4b4" }}>
          <H>Merge duplicate into this record</H>
          <p style={{ color: "#777", fontSize: ".82rem", margin: "0 0 .5rem" }}>
            Enter the duplicate's email. Its gifts, pledges, plans, roles, and relationships move here, then it's deleted.
          </p>
          <form action={mergeAction} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <input type="hidden" name="id" value={id} />
            <input name="source" placeholder="Duplicate constituent's email" style={{ ...inp, flex: 1, minWidth: 240 }} required />
            <button type="submit" style={btnDanger}>Merge</button>
          </form>
        </section>
      )}
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) { return <h2 style={{ fontSize: "1rem", margin: "0 0 .6rem" }}>{children}</h2>; }
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: ".75rem", padding: ".25rem 0", fontSize: ".9rem" }}><span style={{ color: "#888" }}>{k}</span><span>{v}</span></div>;
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" };
const td: React.CSSProperties = { padding: ".4rem .3rem" };
const inp: React.CSSProperties = { padding: ".45rem .55rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".9rem" };
const btn: React.CSSProperties = { padding: ".45rem .8rem", border: "1px solid #ccc", borderRadius: 7, background: "#fff", fontSize: ".88rem", cursor: "pointer", color: "#333", textDecoration: "none" };
const btnDanger: React.CSSProperties = { padding: ".45rem .9rem", border: "1px solid #e0b4b4", borderRadius: 8, background: "#fdecec", color: "#9b1c1c", cursor: "pointer", fontSize: ".9rem" };
const chip: React.CSSProperties = { background: "#eef4f0", border: "1px solid #cfe0d6", color: "#1c6e3c", borderRadius: 99, padding: "2px 10px", fontSize: ".82rem", cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#9b1c1c", cursor: "pointer", fontSize: ".82rem" };
