import type { CSSProperties, ReactNode } from "react";

/**
 * Generic, server-renderable data table (inline-style + brand tokens). Row
 * actions are passed as a render prop so callers can drop in links or a small
 * client menu without forcing the whole table to be a client component.
 */
export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string | number;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  rowActions,
  empty,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  if (rows.length === 0 && empty) {
    return <div style={{ border: "1px solid var(--app-border)", borderRadius: 10, background: "#fff", padding: "2.5rem" }}>{empty}</div>;
  }
  return (
    <div style={{ border: "1px solid var(--app-border)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
        <thead>
          <tr style={{ background: "var(--parchment-deep)", textAlign: "left" }}>
            {columns.map((c) => (
              <th key={c.key} style={{ ...thBase, textAlign: c.align ?? "left", width: c.width }}>{c.header}</th>
            ))}
            {rowActions && <th style={{ ...thBase, width: 48 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderTop: "1px solid var(--app-border)" }}>
              {columns.map((c) => (
                <td key={c.key} style={{ ...tdBase, textAlign: c.align ?? "left" }}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                </td>
              ))}
              {rowActions && <td style={{ ...tdBase, textAlign: "right" }}>{rowActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {footer && <div style={{ borderTop: "1px solid var(--app-border)", padding: ".6rem .8rem" }}>{footer}</div>}
    </div>
  );
}

const thBase: CSSProperties = { padding: ".6rem .8rem", fontWeight: 600, fontSize: ".78rem", color: "#5a5246", textTransform: "uppercase", letterSpacing: ".03em" };
const tdBase: CSSProperties = { padding: ".6rem .8rem", verticalAlign: "middle", color: "var(--app-text)" };
