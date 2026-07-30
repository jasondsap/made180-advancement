"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/** A nav link is active on its own route and anything nested under it. */
function useIsActive() {
  const pathname = usePathname() ?? "";
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

/** Slim header nav — only the always-reachable destinations live up here. */
export function AppTopNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <nav style={{ display: "flex", gap: ".25rem" }}>
      {items.map((n) => {
        const on = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            style={{
              padding: ".4rem .6rem",
              borderRadius: 6,
              fontSize: ".92rem",
              fontWeight: on ? 600 : 500,
              color: on ? "var(--brand)" : "#3a352d",
              background: on ? "var(--parchment-deep)" : "transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The working modules. Collapses to a horizontal strip on narrow screens (globals.css). */
export function AppSideNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <aside className="app-side">
      <div
        className="app-side-list"
        style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: ".35rem", background: "var(--app-surface)" }}
      >
        {items.map((n) => {
          const on = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              style={{
                display: "block",
                borderRadius: 7,
                padding: ".5rem .6rem",
                fontSize: ".88rem",
                fontWeight: on ? 600 : 500,
                color: on ? "var(--brand)" : "var(--app-text)",
                background: on ? "var(--parchment-deep)" : "transparent",
                textDecoration: "none",
              }}
            >
              {n.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
