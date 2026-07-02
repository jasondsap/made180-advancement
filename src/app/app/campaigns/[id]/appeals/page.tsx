import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { getCampaignById } from "@/repositories/campaigns";
import { getOrgById } from "@/repositories/orgs";
import { APPEAL_CHANNELS } from "@/repositories/appeals";
import { campaignSummary, appealPerformance } from "@/repositories/campaignStats";
import { usd, fmtNumber, fmtDate, isoDay } from "@/lib/format";
import { env } from "@/lib/env";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampaignHeader } from "../../CampaignHeader";
import { createAppealAction, updateAppealAction, deleteAppealAction } from "../../actions";

export default async function CampaignAppealsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const campaign = await getCampaignById(ctx.orgId, id);
  if (!campaign) notFound();
  const manage = canManage(ctx.role);

  const [summary, appeals, org] = await Promise.all([
    campaignSummary(ctx.orgId, campaign.id),
    appealPerformance(ctx.orgId, campaign.id),
    getOrgById(ctx.orgId),
  ]);
  const base = (env().APP_BASE_URL ?? "").replace(/\/$/, "");

  return (
    <div>
      <CampaignHeader campaign={campaign} raisedCents={summary.raisedCents} active="appeals" />

      <p style={{ color: "var(--app-text-soft)", fontSize: ".88rem", marginTop: 0 }}>
        An appeal is one specific ask (an email, a mailing, a social push). Use its tracking link so web gifts attribute back to it — the Asks tab creates appeals for you when you send.
      </p>

      <section style={card}>
        {appeals.length === 0 ? (
          <EmptyState
            title="No appeals yet"
            description="Add an appeal below, or use the Asks tab to draft and send one with AI."
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#888", borderBottom: "1px solid #eee" }}>
                <th style={th}>Appeal</th>
                <th style={th}>Channel</th>
                <th style={th}>Sent</th>
                <th style={{ ...th, textAlign: "right" }}>Ask</th>
                <th style={{ ...th, textAlign: "right" }}>Gifts</th>
                <th style={{ ...th, textAlign: "right" }}>Avg</th>
                <th style={{ ...th, textAlign: "right" }}>Raised</th>
              </tr>
            </thead>
            <tbody>
              {appeals.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f3", verticalAlign: "top" }}>
                  <td style={td}>
                    <strong>{a.name}</strong>
                    <div style={{ fontSize: ".76rem", color: "#999", marginTop: ".2rem", wordBreak: "break-all" }}>
                      <code>{base}/give/{org?.slug}?appeal={a.id}</code>
                    </div>
                    {manage && (
                      <details style={{ marginTop: ".3rem" }}>
                        <summary style={{ fontSize: ".78rem", color: "var(--brand)", cursor: "pointer" }}>Edit</summary>
                        <form action={updateAppealAction} style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", alignItems: "center", marginTop: ".45rem" }}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="campaignId" value={campaign.id} />
                          <input name="name" defaultValue={a.name} style={{ ...inp, minWidth: 160 }} required />
                          <select name="channel" defaultValue={a.channel ?? ""} style={inp}>
                            <option value="">— channel —</option>
                            {APPEAL_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                          </select>
                          <input name="askAmount" defaultValue={a.ask_amount_cents ? (a.ask_amount_cents / 100).toString() : ""} placeholder="Ask $" style={{ ...inp, width: 80 }} />
                          <input type="date" name="sentOn" defaultValue={isoDay(a.sent_on) ?? ""} style={inp} />
                          <button type="submit" style={btn}>Save</button>
                        </form>
                        <form action={deleteAppealAction} style={{ marginTop: ".35rem" }}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="campaignId" value={campaign.id} />
                          <button type="submit" style={{ ...btn, color: "#9b1c1c", borderColor: "#e5c4c2" }}>
                            Delete appeal
                          </button>
                        </form>
                      </details>
                    )}
                  </td>
                  <td style={td}>{a.channel ?? "—"}</td>
                  <td style={td}>{a.sent_on ? fmtDate(a.sent_on) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{a.ask_amount_cents ? usd(a.ask_amount_cents) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtNumber(a.giftCount)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{a.giftCount ? usd(a.avgGiftCents) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{usd(a.raisedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {manage && (
        <form action={createAppealAction} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center", marginTop: ".75rem" }}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input name="name" placeholder="New appeal name" style={{ ...inp, flex: 1, minWidth: 160 }} required />
          <select name="channel" style={inp}>
            <option value="">— channel —</option>
            {APPEAL_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          <input name="askAmount" placeholder="Ask $" style={{ ...inp, width: 90 }} />
          <input type="date" name="sentOn" style={inp} title="Sent on" />
          <button type="submit" style={btnPrimary}>Add appeal</button>
        </form>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" };
const th: React.CSSProperties = { padding: ".4rem .5rem" };
const td: React.CSSProperties = { padding: ".55rem .5rem" };
const inp: React.CSSProperties = { padding: ".4rem .5rem", border: "1px solid #ccc", borderRadius: 6, fontSize: ".85rem" };
const btn: React.CSSProperties = { padding: ".3rem .65rem", border: "1px solid #ccc", borderRadius: 6, background: "#fff", fontSize: ".8rem", cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
