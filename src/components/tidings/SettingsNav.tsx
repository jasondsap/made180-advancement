"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsNav({
  status,
}: {
  status: { domains: boolean; senders: boolean; addresses: boolean };
}) {
  const pathname = usePathname() ?? "";
  const items = [
    { label: "Email Domains", href: "/app/tidings/settings/domains", complete: status.domains },
    { label: "Email Senders", href: "/app/tidings/settings/senders", complete: status.senders },
    { label: "Branding", href: "/app/tidings/settings/branding", complete: true },
    { label: "Addresses", href: "/app/tidings/settings/addresses", complete: status.addresses },
    { label: "Merge Fields", href: "/app/tidings/settings/merge-fields", complete: true },
    { label: "Segments", href: "/app/tidings/settings/segments", complete: true },
  ];
  return (
    <aside style={{ width: 220, flexShrink: 0 }}>
      <div style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: ".35rem", background: "#fff" }}>
        {items.map((i) => {
          const on = pathname === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 7,
                padding: ".5rem .6rem",
                fontSize: ".88rem",
                fontWeight: on ? 600 : 500,
                color: on ? "var(--brand)" : "var(--app-text)",
                background: on ? "var(--parchment-deep)" : "transparent",
                textDecoration: "none",
              }}
            >
              <span>{i.label}</span>
              {!i.complete && <span style={{ fontSize: ".68rem", color: "#a06b1f" }}>Incomplete</span>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
