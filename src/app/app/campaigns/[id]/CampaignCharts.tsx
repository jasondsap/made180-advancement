"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { chartPalette } from "@/lib/brand";

const usdAxis = (cents: number) =>
  cents >= 100000 ? `$${Math.round(cents / 100000)}k` : `$${Math.round(cents / 100)}`;

const usdTip = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function CumulativeRaisedChart({
  data,
  goalCents,
}: {
  data: { day: string; cumulativeCents: number }[];
  goalCents: number | null;
}) {
  if (data.length === 0) return <Empty label="No gifts yet — the raised line starts with the first gift." />;
  const rows = data.map((d) => ({ label: dayLabel(d.day), cents: d.cumulativeCents }));
  const max = Math.max(rows[rows.length - 1]?.cents ?? 0, goalCents ?? 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={28} />
        <YAxis tickFormatter={usdAxis} tick={{ fontSize: 12 }} width={52} domain={[0, Math.ceil(max * 1.05)]} />
        <Tooltip formatter={(v: unknown) => usdTip(Number(v))} labelStyle={{ fontSize: 12 }} />
        {goalCents ? (
          <ReferenceLine y={goalCents} stroke="#b08d2f" strokeDasharray="6 4" label={{ value: "Goal", fontSize: 11, fill: "#b08d2f", position: "insideTopRight" }} />
        ) : null}
        <Area type="monotone" dataKey="cents" name="Raised" stroke="#6E2A2A" fill="#6E2A2A" fillOpacity={0.12} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SourcePieChart({ data }: { data: { name: string; totalCents: number }[] }) {
  const rows = data.filter((d) => d.totalCents > 0);
  if (rows.length === 0) return <Empty label="No revenue yet." />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="totalCents" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={false}>
          {rows.map((_, i) => (
            <Cell key={i} fill={chartPalette[i % chartPalette.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: unknown) => usdTip(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: ".9rem" }}>
      {label}
    </div>
  );
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
