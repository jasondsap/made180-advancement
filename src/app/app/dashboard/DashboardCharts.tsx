"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const PALETTE = ["#1c6e3c", "#3a9d5d", "#6cc486", "#a8dcb8", "#e0a96d", "#c97b3c", "#7c9cbf"];

const usdAxis = (cents: number) =>
  cents >= 100000 ? `$${Math.round(cents / 100000)}k` : `$${Math.round(cents / 100)}`;

const usdTip = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function MonthlyTrendChart({ data }: { data: { month: string; totalCents: number }[] }) {
  const rows = data.map((d) => ({
    label: monthLabel(d.month),
    cents: d.totalCents,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={usdAxis} tick={{ fontSize: 12 }} width={48} />
        <Tooltip formatter={(v: unknown) => usdTip(Number(v))} labelStyle={{ fontSize: 12 }} />
        <Bar dataKey="cents" name="Raised" fill="#1c6e3c" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FundPieChart({ data }: { data: { name: string; totalCents: number }[] }) {
  const rows = data.filter((d) => d.totalCents > 0);
  if (rows.length === 0) {
    return <Empty label="No gifts in this period yet." />;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="totalCents" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={false}>
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
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

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "short" });
}
