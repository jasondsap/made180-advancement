import type { ReactNode } from "react";

/** Centered empty/zero state for tables and panels. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: ".4rem" }}>
      {icon && <div style={{ fontSize: "1.6rem", color: "var(--accent)", marginBottom: ".25rem" }}>{icon}</div>}
      <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--ink)" }}>{title}</h3>
      {description && <p style={{ margin: 0, maxWidth: 380, fontSize: ".88rem", color: "var(--app-text-soft)" }}>{description}</p>}
      {action && <div style={{ marginTop: ".75rem" }}>{action}</div>}
    </div>
  );
}
