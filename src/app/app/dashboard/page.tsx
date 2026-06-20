import type { ReactNode } from "react";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import {
  periodTotals,
  raisedByFund,
  recurringVsOneTime,
  newVsReturningDonors,
  monthlyTrend,
  campaignProgress,
  fundTotals,
} from "@/repositories/analytics";
import { usd, fmtNumber } from "@/lib/format";
import { MonthlyTrendChart, FundPieChart } from "./DashboardCharts";

type PeriodKey = "this_month" | "ytd" | "last_12" | "all";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "ytd", label: "Year to date" },
  { key: "last_12", label: "Last 12 mo" },
  { key: "all", label: "All time" },
];

function sinceFor(period: PeriodKey): Date | null {
  const now = new Date();
  switch (period) {
    case "this_month":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case "ytd":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case "last_12":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    case "all":
      return null;
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null; // layout handles auth
  const orgId = ctx.orgId;

  const { period: periodRaw } = await searchParams;
  const period = (PERIODS.find((p) => p.key === periodRaw)?.key ?? "ytd") as PeriodKey;
  const since = sinceFor(period);

  const [totals, byFund, split, donors, trend, campaigns, lifetimeFunds] = await Promise.all([
    periodTotals(orgId, since),
    raisedByFund(orgId, since),
    recurringVsOneTime(orgId, since),
    newVsReturningDonors(orgId, since),
    monthlyTrend(orgId),
    campaignProgress(orgId),
    fundTotals(orgId),
  ]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Dashboard</h1>
        <nav style={{ display: "flex", gap: ".25rem" }}>
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/app/dashboard?period=${p.key}`}
              style={{
                fontSize: ".82rem", padding: ".3rem .6rem", borderRadius: 6, textDecoration: "none",
                border: "1px solid", borderColor: p.key === period ? "var(--brand)" : "#d8dad8",
                background: p.key === period ? "#edf1ec" : "#fff",
                color: p.key === period ? "var(--brand)" : "#444",
              }}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginTop: "1.25rem" }}>
        <Stat label="Total raised" value={usd(totals.totalCents)} hint={`${fmtNumber(totals.giftCount)} gifts`} />
        <Stat label="Recurring" value={usd(split.recurringCents)} hint={`One-time ${usd(split.oneTimeCents)}`} />
        <Stat label="New donors" value={fmtNumber(donors.newDonors)} hint={period === "all" ? "(all-time)" : "first gift in period"} />
        <Stat label="Returning donors" value={fmtNumber(donors.returningDonors)} hint="gave before this period" />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        <Card title="Revenue (last 12 months)">
          <MonthlyTrendChart data={trend} />
        </Card>
        <Card title="By fund (this period)">
          <FundPieChart data={byFund.map((f) => ({ name: f.name, totalCents: f.totalCents }))} />
        </Card>
      </div>

      {/* Campaign progress */}
      <Card title="Campaign progress" style={{ marginTop: "1rem" }}>
        {campaigns.length === 0 ? (
          <Muted>No active campaigns. Create one under Campaigns.</Muted>
        ) : (
          <div style={{ display: "grid", gap: ".9rem" }}>
            {campaigns.map((c) => {
              const pct = c.goalCents && c.goalCents > 0 ? Math.min(100, Math.round((c.raisedCents / c.goalCents) * 100)) : null;
              return (
                <div key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".9rem", marginBottom: ".25rem" }}>
                    <span>{c.name}</span>
                    <span style={{ color: "#555" }}>
                      {usd(c.raisedCents)}{c.goalCents ? ` of ${usd(c.goalCents)}${pct !== null ? ` (${pct}%)` : ""}` : ""}
                    </span>
                  </div>
                  <div style={{ height: 8, background: "#eef0ee", borderRadius: 99 }}>
                    <div style={{ height: 8, width: `${pct ?? 0}%`, background: "var(--brand)", borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Fund totals (lifetime) */}
      <Card title="Fund totals (lifetime raised)" style={{ marginTop: "1rem" }}>
        <p style={{ margin: "0 0 .5rem", fontSize: ".8rem", color: "#999" }}>
          Total raised per fund to date. (Net balances require expense tracking, which is out of scope — no general ledger.)
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".92rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#888", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: ".4rem 0" }}>Fund</th>
              <th style={{ padding: ".4rem 0", textAlign: "right" }}>Gifts</th>
              <th style={{ padding: ".4rem 0", textAlign: "right" }}>Raised</th>
            </tr>
          </thead>
          <tbody>
            {lifetimeFunds.map((f) => (
              <tr key={f.code} style={{ borderBottom: "1px solid #f3f4f3" }}>
                <td style={{ padding: ".4rem 0" }}>{f.name}</td>
                <td style={{ padding: ".4rem 0", textAlign: "right", color: "#555" }}>{fmtNumber(f.count)}</td>
                <td style={{ padding: ".4rem 0", textAlign: "right", fontWeight: 600 }}>{usd(f.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" }}>
      <div style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".04em", color: "#888" }}>{label}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, margin: ".2rem 0" }}>{value}</div>
      {hint && <div style={{ fontSize: ".8rem", color: "#999" }}>{hint}</div>}
    </div>
  );
}

function Card({ title, children, style }: { title: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", ...style }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 .75rem" }}>{title}</h2>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p style={{ color: "#999", fontSize: ".9rem", margin: 0 }}>{children}</p>;
}
