"use client";

import { useEffect, useState } from "react";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Public campaign progress bar — fills from 0 to the live percentage on load. */
export function AnimatedThermometer({
  raisedCents,
  goalCents,
  donorCount,
}: {
  raisedCents: number;
  goalCents: number | null;
  donorCount: number;
}) {
  const pct = goalCents && goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : null;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(pct ?? 0));
    return () => cancelAnimationFrame(t);
  }, [pct]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: ".4rem" }}>
        <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>{usd(raisedCents)}</span>
        <span style={{ color: "#666", fontSize: ".95rem" }}>
          {goalCents ? `raised of ${usd(goalCents)} goal` : "raised"}
          {pct !== null ? ` · ${pct}%` : ""}
        </span>
      </div>
      <div style={{ height: 14, background: "#eee", borderRadius: 99, marginTop: ".45rem", overflow: "hidden" }}>
        <div
          style={{
            height: 14,
            width: `${width}%`,
            background: "var(--brand)",
            borderRadius: 99,
            transition: "width 1.2s ease-out",
          }}
        />
      </div>
      <p style={{ color: "#888", fontSize: ".85rem", margin: ".45rem 0 0" }}>
        {donorCount.toLocaleString("en-US")} donor{donorCount === 1 ? "" : "s"} so far
      </p>
    </div>
  );
}
