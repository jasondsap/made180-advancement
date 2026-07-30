import { getAuthContext, canManage } from "@/lib/auth";
import { listSegments, resolveSegmentRows } from "@/repositories/engage/segments";
import { listFunds } from "@/repositories/funds";
import { usd } from "@/lib/format";
import type { EngageSegment, SegmentCriteria } from "@/types/engage";
import { createSegmentAction, updateSegmentAction, deleteSegmentAction } from "../../actions";

export const dynamic = "force-dynamic";

type FundOption = { id: string; name: string };

export default async function SegmentsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  const { msg } = await searchParams;

  const [segments, funds] = await Promise.all([
    listSegments(ctx.orgId),
    listFunds(ctx.orgId, { activeOnly: true }),
  ]);
  const fundOpts: FundOption[] = funds.map((f) => ({ id: f.id, name: f.name }));
  const fundName = (id: string) => fundOpts.find((f) => f.id === id)?.name ?? "fund";

  // Raw (consent-agnostic) match counts, so the size shown reflects the segment
  // definition itself rather than any one channel's reachable subset.
  const counts = await Promise.all(segments.map((s) => resolveSegmentRows(ctx.orgId, s.criteria_json).then((r) => r.length)));

  return (
    <section style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "1.25rem", background: "#fff" }}>
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 .25rem" }}>Segments</h2>
      <p style={{ color: "var(--app-text-soft)", fontSize: ".88rem", margin: "0 0 1rem" }}>
        Reusable, saved audiences. A segment is re-evaluated against your live data every time you send to it — consent rules
        (opt-out, do-not-contact) are always applied on top.
      </p>
      {msg === "saved" && <Banner>Segment saved.</Banner>}

      {segments.length === 0 && <p style={{ color: "#888", fontSize: ".9rem" }}>No segments yet. Create one below.</p>}

      <div style={{ display: "grid", gap: ".75rem" }}>
        {segments.map((s, i) => (
          <details key={s.id} style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: ".75rem 1rem" }}>
            <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontSize: ".8rem", color: "#888" }}>{counts[i]} contact(s) · {summarize(s.criteria_json, fundName)}</span>
            </summary>
            {manage ? (
              <form action={updateSegmentAction} style={{ marginTop: ".75rem" }}>
                <input type="hidden" name="id" value={s.id} />
                <SegmentFields funds={fundOpts} segment={s} />
                <div style={{ display: "flex", gap: ".5rem", marginTop: ".75rem" }}>
                  <button style={btnPrimary}>Save changes</button>
                </div>
              </form>
            ) : (
              <p style={{ marginTop: ".5rem", fontSize: ".85rem", color: "#666" }}>{summarize(s.criteria_json, fundName)}</p>
            )}
            {manage && (
              <form action={deleteSegmentAction} style={{ marginTop: ".5rem" }}>
                <input type="hidden" name="id" value={s.id} />
                <button style={btnDanger}>Delete segment</button>
              </form>
            )}
          </details>
        ))}
      </div>

      {manage && (
        <details style={{ marginTop: "1.25rem", border: "1px dashed var(--app-border)", borderRadius: 10, padding: ".75rem 1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--brand)" }}>+ New segment</summary>
          <form action={createSegmentAction} style={{ marginTop: ".75rem" }}>
            <SegmentFields funds={fundOpts} />
            <div style={{ marginTop: ".75rem" }}><button style={btnPrimary}>Create segment</button></div>
          </form>
        </details>
      )}
    </section>
  );
}

/** Shared criteria-builder fields, prefilled from a segment when editing. */
function SegmentFields({ funds, segment }: { funds: FundOption[]; segment?: EngageSegment }) {
  const c = segment?.criteria_json ?? {};
  const dollars = (cents?: number) => (cents === undefined ? "" : (cents / 100).toString());
  return (
    <div style={{ display: "grid", gap: ".75rem", maxWidth: 540 }}>
      <Field label="Segment name">
        <input name="name" defaultValue={segment?.name ?? ""} style={inp} placeholder="Major donors 2026" required />
      </Field>
      <Field label="Description (optional)">
        <input name="description" defaultValue={segment?.description ?? ""} style={inp} placeholder="Lifetime giving over $1,000" />
      </Field>

      <fieldset style={fset}>
        <legend style={leg}>Gave to fund(s)</legend>
        <div style={{ display: "grid", gap: ".3rem" }}>
          {funds.length === 0 && <span style={{ fontSize: ".82rem", color: "#999" }}>No funds yet.</span>}
          {funds.map((f) => (
            <label key={f.id} style={chk}>
              <input type="checkbox" name="fundIds" value={f.id} defaultChecked={c.fundIds?.includes(f.id) ?? false} /> {f.name}
            </label>
          ))}
        </div>
        <p style={hint}>Matches contacts with at least one completed gift to any checked fund. Leave all unchecked to ignore.</p>
      </fieldset>

      <fieldset style={fset}>
        <legend style={leg}>Lifetime giving total</legend>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: ".85rem", color: "#666" }}>$</span>
          <input name="givingMin" defaultValue={dollars(c.givingMinCents)} style={{ ...inp, width: 110 }} placeholder="min" inputMode="decimal" />
          <span style={{ fontSize: ".85rem", color: "#666" }}>to $</span>
          <input name="givingMax" defaultValue={dollars(c.givingMaxCents)} style={{ ...inp, width: 110 }} placeholder="max" inputMode="decimal" />
        </div>
      </fieldset>

      <fieldset style={fset}>
        <legend style={leg}>Gave between</legend>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" name="giftSince" defaultValue={c.giftSince ?? ""} style={inp} />
          <span style={{ fontSize: ".85rem", color: "#666" }}>and</span>
          <input type="date" name="giftUntil" defaultValue={c.giftUntil ?? ""} style={inp} />
        </div>
      </fieldset>

      <Field label="Contact type">
        <select name="constituentType" defaultValue={c.constituentType ?? ""} style={inp}>
          <option value="">Any</option>
          <option value="individual">Individuals</option>
          <option value="organization">Organizations</option>
        </select>
      </Field>
    </div>
  );
}

/** Human-readable one-line summary of a segment's criteria. */
function summarize(c: SegmentCriteria, fundName: (id: string) => string): string {
  const parts: string[] = [];
  if (c.fundIds?.length) parts.push(`gave to ${c.fundIds.map(fundName).join(", ")}`);
  if (c.givingMinCents !== undefined && c.givingMaxCents !== undefined) parts.push(`${usd(c.givingMinCents)}–${usd(c.givingMaxCents)} lifetime`);
  else if (c.givingMinCents !== undefined) parts.push(`≥ ${usd(c.givingMinCents)} lifetime`);
  else if (c.givingMaxCents !== undefined) parts.push(`≤ ${usd(c.givingMaxCents)} lifetime`);
  if (c.giftSince && c.giftUntil) parts.push(`gave ${c.giftSince} to ${c.giftUntil}`);
  else if (c.giftSince) parts.push(`gave since ${c.giftSince}`);
  else if (c.giftUntil) parts.push(`gave before ${c.giftUntil}`);
  if (c.constituentType) parts.push(c.constituentType === "individual" ? "individuals" : "organizations");
  return parts.length ? parts.join(" · ") : "all contacts";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".3rem", fontSize: ".82rem", color: "#555" }}>{label}{children}</label>;
}
function Banner({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".6rem .8rem", borderRadius: 8, fontSize: ".88rem", marginBottom: "1rem" }}>{children}</div>;
}

const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".9rem", background: "#fff" };
const fset: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 9, padding: ".6rem .8rem", display: "grid", gap: ".4rem" };
const leg: React.CSSProperties = { fontWeight: 600, fontSize: ".8rem", padding: "0 .3rem", color: "#555" };
const chk: React.CSSProperties = { display: "flex", gap: ".45rem", alignItems: "center", fontSize: ".88rem" };
const hint: React.CSSProperties = { fontSize: ".76rem", color: "#999", margin: ".2rem 0 0" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: ".4rem .75rem", borderRadius: 7, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".8rem", cursor: "pointer" };
