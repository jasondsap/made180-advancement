import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { listPledges, pledgeSummary } from "@/repositories/pledges";
import { listFunds } from "@/repositories/funds";
import { listCampaigns } from "@/repositories/campaigns";
import { usd } from "@/lib/format";
import { createPledgeAction, applyPaymentAction, writeOffPledgeAction, sendPledgeReminderAction } from "./actions";

const MSGS: Record<string, [string, string, string]> = {
  created: ["#edf1ec", "var(--forest)", "Pledge created."],
  paid: ["#edf1ec", "var(--forest)", "Payment applied."],
  donor_notfound: ["#fdecec", "#9b1c1c", "No constituent found with that email — add them first (Constituents → New)."],
  bad_amount: ["#fdecec", "#9b1c1c", "Enter a valid amount greater than zero."],
  bad_fund: ["#fdecec", "#9b1c1c", "That fund doesn't exist."],
  bad_campaign: ["#fdecec", "#9b1c1c", "That campaign doesn't exist."],
  pledge_notfound: ["#fdecec", "#9b1c1c", "Pledge not found."],
  written_off: ["#edf1ec", "var(--forest)", "Pledge written off — it no longer counts as outstanding."],
  reopened: ["#edf1ec", "var(--forest)", "Pledge reopened."],
  reminded: ["#edf1ec", "var(--forest)", "Reminder email sent."],
  no_email: ["#fff4e5", "#7a4f00", "That donor has no email (or is marked do-not-contact) — no reminder sent."],
  remind_error: ["#fdecec", "#9b1c1c", "Reminder could not be sent (check email config)."],
};

export default async function PledgesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { msg } = await searchParams;
  const banner = msg ? MSGS[msg] : undefined;
  const isManager = canManage(ctx.role);
  const [pledges, summary, funds, campaigns] = await Promise.all([
    listPledges(ctx.orgId),
    pledgeSummary(ctx.orgId),
    listFunds(ctx.orgId, { activeOnly: true }),
    listCampaigns(ctx.orgId),
  ]);

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Pledges</h1>
      {banner && (
        <div style={{ background: banner[0], color: banner[1], padding: ".7rem .9rem", borderRadius: 8, margin: "0 0 1rem", fontSize: ".9rem" }}>
          {banner[2]}
        </div>
      )}

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
          <select name="campaignId" style={inp}><option value="">— campaign —</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="schedule" style={inp}><option value="">— schedule —</option><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="annual">annual</option></select>
          <input type="date" name="startsOn" style={inp} />
          <button type="submit" style={btnPrimary}>Create</button>
        </form>
      </section>

      <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, overflow: "hidden", marginTop: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead><tr style={{ textAlign: "left", color: "#777", background: "#fafbfa" }}>
            <th style={th}>Donor</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={{ ...th, textAlign: "right" }}>Balance</th><th style={th}>Status</th><th style={th}>Record payment</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {pledges.length === 0 && <tr><td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "#999" }}>No pledges yet.</td></tr>}
            {pledges.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                <td style={td}><Link href={`/app/constituents/${p.constituent_id}`} style={{ color: "var(--brand)", textDecoration: "none" }}>{p.donor_name}</Link></td>
                <td style={{ ...td, textAlign: "right" }}>{usd(p.total_cents)}</td>
                <td style={{ ...td, textAlign: "right" }}>{usd(p.balance_cents)}</td>
                <td style={td}>{p.status}</td>
                <td style={td}>
                  {p.status === "open" ? (
                    <form action={applyPaymentAction} style={{ display: "flex", gap: ".35rem", alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="pledgeId" value={p.id} />
                      <input name="amount" placeholder="$" style={{ ...inp, width: 70 }} />
                      <input type="date" name="paidOn" title="Date received (blank = today)" style={{ ...inp, width: 130 }} />
                      <button type="submit" style={btn}>Apply</button>
                    </form>
                  ) : <span style={{ color: "#999" }}>—</span>}
                </td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {isManager && p.status === "open" && (
                    <span style={{ display: "inline-flex", gap: ".35rem" }}>
                      <form action={sendPledgeReminderAction} style={{ display: "inline" }}>
                        <input type="hidden" name="pledgeId" value={p.id} />
                        <button type="submit" title="Email the donor a balance reminder" style={btn}>Remind</button>
                      </form>
                      <form action={writeOffPledgeAction} style={{ display: "inline" }}>
                        <input type="hidden" name="pledgeId" value={p.id} />
                        <button type="submit" title="Mark uncollectable" style={{ ...btn, color: "#9b1c1c", borderColor: "#e6c3c0" }}>Write off</button>
                      </form>
                    </span>
                  )}
                  {isManager && p.status === "written_off" && (
                    <form action={writeOffPledgeAction} style={{ display: "inline" }}>
                      <input type="hidden" name="pledgeId" value={p.id} />
                      <input type="hidden" name="to" value="open" />
                      <button type="submit" style={btn}>Reopen</button>
                    </form>
                  )}
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
const btnPrimary: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
