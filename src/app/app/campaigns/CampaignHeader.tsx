import Link from "next/link";
import type { Campaign } from "@/repositories/campaigns";
import { SubTabs } from "@/components/ui/SubTabs";
import { Badge } from "@/components/ui/Badge";
import { usd, isoDay } from "@/lib/format";

export const CATEGORY_LABELS: Record<string, string> = {
  annual: "Annual",
  capital: "Capital",
  event: "Event",
  giving_day: "Giving day",
  memorial: "Memorial",
};

export function daysRemaining(endsOn: string | Date | null): number | null {
  const key = isoDay(endsOn);
  if (!key) return null;
  const end = new Date(`${key}T23:59:59Z`);
  const diff = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

/** Shared campaign detail header: name, badges, thermometer, tab nav. Fetch-free. */
export function CampaignHeader({
  campaign,
  raisedCents,
  active,
  publicUrl,
}: {
  campaign: Campaign;
  raisedCents: number;
  active: "overview" | "appeals" | "asks" | "gifts" | "report";
  publicUrl?: string | null;
}) {
  const goal = campaign.goal_cents;
  const pct = goal && goal > 0 ? Math.min(100, Math.round((raisedCents / goal) * 100)) : null;
  const days = daysRemaining(campaign.ends_on);
  const base = `/app/campaigns/${campaign.id}`;

  return (
    <header style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
        <Link href="/app/campaigns" style={{ fontSize: ".82rem", color: "var(--app-text-soft)", textDecoration: "none" }}>
          ← Campaigns
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: ".65rem", flexWrap: "wrap", marginTop: ".35rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{campaign.name}</h1>
        {campaign.category && <Badge tone="info">{CATEGORY_LABELS[campaign.category] ?? campaign.category}</Badge>}
        <Badge tone={campaign.active ? "success" : "neutral"}>{campaign.active ? "Active" : "Inactive"}</Badge>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noreferrer" style={{ fontSize: ".82rem", color: "var(--brand)" }}>
            Public page ↗
          </a>
        )}
        <span style={{ flex: 1 }} />
        <Link href={`${base}/edit`} style={{ fontSize: ".85rem", color: "var(--brand)", textDecoration: "none", fontWeight: 600 }}>
          Edit
        </Link>
      </div>

      <div style={{ marginTop: ".7rem", maxWidth: 680 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".88rem", marginBottom: ".25rem" }}>
          <span style={{ fontWeight: 600 }}>{usd(raisedCents)} raised</span>
          <span style={{ color: "#555" }}>
            {goal ? `of ${usd(goal)} goal${pct !== null ? ` · ${pct}%` : ""}` : "no goal set"}
            {days !== null ? ` · ${days} day${days === 1 ? "" : "s"} left` : ""}
          </span>
        </div>
        <div style={{ height: 10, background: "#eef0ee", borderRadius: 99 }}>
          <div style={{ height: 10, width: `${pct ?? 0}%`, background: "var(--brand)", borderRadius: 99 }} />
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <SubTabs
          active={active}
          items={[
            { key: "overview", label: "Overview", href: base },
            { key: "appeals", label: "Appeals", href: `${base}/appeals` },
            { key: "asks", label: "Asks", href: `${base}/asks` },
            { key: "gifts", label: "Gifts", href: `${base}/gifts` },
            { key: "report", label: "Report", href: `${base}/report` },
          ]}
        />
      </div>
    </header>
  );
}
