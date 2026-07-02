import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { listCampaigns } from "@/repositories/campaigns";
import { campaignRaisedTotals } from "@/repositories/campaignStats";
import { usd, fmtNumber, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CATEGORY_LABELS, daysRemaining } from "./CampaignHeader";

export default async function CampaignsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  const [campaigns, totals] = await Promise.all([
    listCampaigns(ctx.orgId),
    campaignRaisedTotals(ctx.orgId),
  ]);
  const totalsById = new Map(totals.map((t) => [t.campaignId, t]));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Campaigns</h1>
        {manage && (
          <Link href="/app/campaigns/new" style={btnPrimary}>
            New campaign
          </Link>
        )}
      </div>
      <p style={{ color: "var(--app-text-soft)", fontSize: ".9rem", margin: ".4rem 0 1.1rem" }}>
        A campaign is your fundraising effort with a goal — gifts, appeals, and fundraiser revenue all roll up here.
      </p>

      {campaigns.length === 0 ? (
        <section style={card}>
          <EmptyState
            title="No campaigns yet"
            description="Create your first campaign to set a goal, track progress, and send targeted asks."
            action={manage ? <Link href="/app/campaigns/new" style={btnPrimary}>New campaign</Link> : undefined}
          />
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {campaigns.map((c) => {
            const t = totalsById.get(c.id);
            const raised = t?.raisedCents ?? 0;
            const pct = c.goal_cents && c.goal_cents > 0 ? Math.min(100, Math.round((raised / c.goal_cents) * 100)) : null;
            const days = daysRemaining(c.ends_on);
            return (
              <Link key={c.id} href={`/app/campaigns/${c.id}`} style={{ ...card, textDecoration: "none", color: "inherit", display: "block", opacity: c.active ? 1 : 0.65 }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "1.02rem", flex: 1 }}>{c.name}</strong>
                  {c.category && <Badge tone="info">{CATEGORY_LABELS[c.category] ?? c.category}</Badge>}
                  {!c.active && <Badge tone="neutral">Inactive</Badge>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", margin: ".8rem 0 .3rem" }}>
                  <span style={{ fontWeight: 700 }}>{usd(raised)}</span>
                  <span style={{ color: "#777" }}>{c.goal_cents ? `of ${usd(c.goal_cents)}${pct !== null ? ` · ${pct}%` : ""}` : "no goal"}</span>
                </div>
                <div style={{ height: 8, background: "#eef0ee", borderRadius: 99 }}>
                  <div style={{ height: 8, width: `${pct ?? 0}%`, background: "var(--brand)", borderRadius: 99 }} />
                </div>
                <div style={{ display: "flex", gap: ".9rem", marginTop: ".7rem", fontSize: ".8rem", color: "#888" }}>
                  <span>{fmtNumber(t?.donorCount ?? 0)} donors</span>
                  <span>{fmtNumber(t?.giftCount ?? 0)} gifts</span>
                  {days !== null ? <span>{days} day{days === 1 ? "" : "s"} left</span> : c.ends_on ? <span>ended {fmtDate(c.ends_on)}</span> : null}
                  {c.public_slug && <span style={{ color: "var(--brand)" }}>public</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {!manage && <p style={{ color: "#999", fontSize: ".82rem", marginTop: "1rem" }}>Campaign management requires an admin role.</p>}
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" };
const btnPrimary: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-block" };
