import { getAuthContext, canManage } from "@/lib/auth";
import { listCampaigns } from "@/repositories/campaigns";
import { listAppeals, APPEAL_CHANNELS } from "@/repositories/appeals";
import { getOrgById } from "@/repositories/orgs";
import { usd } from "@/lib/format";
import { createCampaignAction, updateCampaignAction, createAppealAction } from "../settings/actions";
import { env } from "@/lib/env";

export default async function CampaignsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  const [campaigns, appeals, org] = await Promise.all([
    listCampaigns(ctx.orgId),
    listAppeals(ctx.orgId),
    getOrgById(ctx.orgId),
  ]);
  const base = (env().APP_BASE_URL ?? "").replace(/\/$/, "");

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Campaigns & appeals</h1>

      <h2 style={h2}>Campaigns</h2>
      <div style={cardWrap}>
        {campaigns.length === 0 && <p style={muted}>No campaigns yet.</p>}
        {campaigns.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid #f1f2f1", padding: ".6rem .8rem" }}>
            {manage ? (
              <form action={updateCampaignAction} style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
                <input type="hidden" name="id" value={c.id} />
                <input name="name" defaultValue={c.name} style={{ ...inp, flex: 1, minWidth: 160 }} />
                <span style={muted}>Goal $</span>
                <input name="goal" defaultValue={c.goal_cents ? (c.goal_cents / 100).toString() : ""} style={{ ...inp, width: 100 }} placeholder="—" />
                <label style={{ fontSize: ".85rem", display: "flex", gap: ".3rem", alignItems: "center" }}><input type="checkbox" name="active" defaultChecked={c.active} /> Active</label>
                <button type="submit" style={btn}>Save</button>
              </form>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>{c.name}</span><span style={muted}>{c.goal_cents ? `Goal ${usd(c.goal_cents)}` : ""} · {c.active ? "active" : "inactive"}</span></div>
            )}
          </div>
        ))}
      </div>
      {manage && (
        <form action={createCampaignAction} style={{ ...addBar }}>
          <input name="name" placeholder="New campaign name" style={{ ...inp, flex: 1, minWidth: 160 }} required />
          <input name="goal" placeholder="Goal $" style={{ ...inp, width: 110 }} />
          <input type="date" name="startsOn" style={inp} />
          <input type="date" name="endsOn" style={inp} />
          <button type="submit" style={btnPrimary}>Add campaign</button>
        </form>
      )}

      <h2 style={h2}>Appeals</h2>
      <p style={{ ...muted, marginTop: 0 }}>
        Use an appeal&apos;s tracking link on emails/landing pages so web gifts attribute to it.
      </p>
      <div style={cardWrap}>
        {appeals.length === 0 && <p style={muted}>No appeals yet.</p>}
        {appeals.map((a) => (
          <div key={a.id} style={{ borderTop: "1px solid #f1f2f1", padding: ".6rem .8rem", fontSize: ".9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
              <span><strong>{a.name}</strong> {a.channel && <span style={muted}>· {a.channel}</span>} {a.campaign_name && <span style={muted}>· {a.campaign_name}</span>}</span>
            </div>
            <div style={{ ...muted, marginTop: ".25rem" }}>
              Tracking link: <code>{base}/give/{org?.slug}?appeal={a.id}</code>
            </div>
          </div>
        ))}
      </div>
      {manage && (
        <form action={createAppealAction} style={addBar}>
          <input name="name" placeholder="New appeal name" style={{ ...inp, flex: 1, minWidth: 160 }} required />
          <select name="campaignId" style={inp}>
            <option value="">— campaign —</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="channel" style={inp}>
            <option value="">— channel —</option>
            {APPEAL_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          <button type="submit" style={btnPrimary}>Add appeal</button>
        </form>
      )}
      {!manage && <p style={{ ...muted, marginTop: "1rem" }}>Campaign management requires an admin role.</p>}
    </div>
  );
}

const h2: React.CSSProperties = { fontSize: "1.05rem", marginTop: "1.5rem" };
const cardWrap: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, overflow: "hidden" };
const addBar: React.CSSProperties = { display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center", marginTop: ".75rem" };
const muted: React.CSSProperties = { color: "#999", fontSize: ".82rem" };
const inp: React.CSSProperties = { padding: ".4rem .5rem", border: "1px solid #ccc", borderRadius: 6, fontSize: ".88rem" };
const btn: React.CSSProperties = { padding: ".35rem .7rem", border: "1px solid #ccc", borderRadius: 6, background: "#fff", fontSize: ".82rem", cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 8, background: "#1c6e3c", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
