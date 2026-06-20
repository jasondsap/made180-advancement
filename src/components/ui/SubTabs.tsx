import Link from "next/link";

/** Horizontal sub-tab nav (e.g. Sent / Outbox / Drafts). Active state passed in. */
export function SubTabs({
  items,
  active,
}: {
  items: { label: string; href: string; key: string; count?: number }[];
  active: string;
}) {
  return (
    <nav style={{ display: "flex", gap: ".25rem", borderBottom: "1px solid var(--app-border)", marginBottom: "1rem" }}>
      {items.map((i) => {
        const on = i.key === active;
        return (
          <Link
            key={i.key}
            href={i.href}
            style={{
              padding: ".55rem .85rem",
              fontSize: ".9rem",
              fontWeight: on ? 600 : 500,
              color: on ? "var(--brand)" : "var(--app-text-soft)",
              borderBottom: on ? "2px solid var(--brand)" : "2px solid transparent",
              marginBottom: -1,
              textDecoration: "none",
            }}
          >
            {i.label}
            {typeof i.count === "number" && <span style={{ marginLeft: ".35rem", color: "#9b9388", fontWeight: 500 }}>{i.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
