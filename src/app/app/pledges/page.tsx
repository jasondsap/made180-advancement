import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { listPledges, pledgeSummary } from "@/repositories/pledges";
import { listFunds } from "@/repositories/funds";
import { usd } from "@/lib/format";
import { createPledgeAction, applyPaymentAction } from "./actions";

export default async function PledgesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  await searchParams;
  const [pledges, summary, funds] = await Promise.all([
    listPledges(ctx.orgId),
    pledgeSummary(ctx.orgId),
    listFunds(ctx.orgId, { activeOnly: true }),
  ]);

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Pledges</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "1rem" }}>
        <Stat label="Open pledges" value={String(summary.openCount)} />
        <Stat label="Projected (open)" value={usd(summary.projectedCents)} />
        <Stat label="Received" value={usd(summary.receivedCents)} />
        <Stat label="Outstanding" value={usd(summary.outstandingCents)} />
      </div>

      <section style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>New pledge</h2>
        <form action={createPledgeAction} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input name="donor" placeholder="Donor email" style={{ ...inp, flex: 1, minWidth: 180 }} required />
          <input name="total" placeholder="Total $" style={{ ...inp, width: 110 }} required />
          <select name="fundId" style={inp}><option value="">— fund —</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <select name="schedule" style={inp}><option value="">— schedule —</option><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="annual">annual</option></select>
          <input type="date" name="startsOn" style={inp} />
          <button type="submit" style={btnPrimary}>Create</button>
        </form>
      </section>

      <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, overflow: "hidden", marginTop: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead><tr style={{ textAlign: "left", color: "#777", background: "#fafbfa" }}>
            <th style={th}>Donor</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={{ ...th, textAlign: "right" }}>Balance</th><th style={th}>Status</th><th style={th}>Record payment</th>
          </tr></thead>
          <tbody>
            {pledges.length === 0 && <tr><td colSpan={5} style={{ padding: "1.5rem", textAlign: "center", color: "#999" }}>No pledges yet.</td></tr>}
            {pledges.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                <td style={td}><Link href={`/app/constituents/${p.constituent_id}`} style={{ color: "#1c6e3c", textDecoration: "none" }}>{p.donor_name}</Link></td>
                <td style={{ ...td, textAlign: "right" }}>{usd(p.total_cents)}</td>
                <td style={{ ...td, textAlign: "right" }}>{usd(p.balance_cents)}</td>
                <td style={td}>{p.status}</td>
                <td style={td}>
                  {p.status === "open" ? (
                    <form action={applyPaymentAction} style={{ display: "flex", gap: ".35rem", alignItems: "center" }}>
                      <input type="hidden" name="pledgeId" value={p.id} />
                      <input type="hidden" name="constituentId" value={p.constituent_id} />
                      <input type="hidden" name="fundId" value={p.fund_id ?? ""} />
                      <input name="amount" placeholder="$" style={{ ...inp, width: 80 }} />
                      <button type="submit" style={btn}>Apply</button>
                    </form>
                  ) : <span style={{ color: "#999" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" }}>
      <div style={{ fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".04em", color: "#888" }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: ".2rem" }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: ".6rem .8rem", fontWeight: 600 };
const td: React.CSSProperties = { padding: ".5rem .8rem" };
const inp: React.CSSProperties = { padding: ".4rem .5rem", border: "1px solid #ccc", borderRadius: 6, fontSize: ".88rem" };
const btn: React.CSSProperties = { padding: ".35rem .7rem", border: "1px solid #ccc", borderRadius: 6, background: "#fff", fontSize: ".82rem", cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 8, background: "#1c6e3c", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
