import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "#eceae4", fg: "#5a5246" },
  success: { bg: "#edf1ec", fg: "#2F4032" },
  warning: { bg: "#fbf1e0", fg: "#a06b1f" },
  danger: { bg: "#fbeceb", fg: "#9b1c1c" },
  info: { bg: "#eef1f5", fg: "#3a4a63" },
};

/** Small status pill with a leading dot. Tone drives the color. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: ".4rem", background: t.bg, color: t.fg, borderRadius: 999, padding: ".12rem .55rem", fontSize: ".78rem", fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: t.fg, opacity: 0.8 }} />
      {children}
    </span>
  );
}
