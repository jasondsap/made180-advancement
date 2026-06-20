"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Emails", href: "/app/engage/email", match: "/app/engage/email" },
  { label: "Texts", href: "/app/engage/texts", match: "/app/engage/texts" },
  { label: "Mailings", href: "/app/engage/mailings", match: "/app/engage/mailings" },
  { label: "Settings", href: "/app/engage/settings/domains", match: "/app/engage/settings" },
];

export function EngageTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav style={{ display: "flex", gap: ".5rem", borderBottom: "1px solid var(--app-border)", marginBottom: "1.5rem" }}>
      {TABS.map((t) => {
        const on = pathname.startsWith(t.match);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: ".6rem .9rem",
              fontSize: ".95rem",
              fontWeight: on ? 600 : 500,
              color: on ? "var(--brand)" : "var(--app-text-soft)",
              borderBottom: on ? "2px solid var(--brand)" : "2px solid transparent",
              marginBottom: -1,
              textDecoration: "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
