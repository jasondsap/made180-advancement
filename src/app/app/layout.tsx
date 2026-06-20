import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUser, resolveActiveOrgId, roleFor, listAccessibleOrgs } from "@/lib/auth";
import { getOrgById } from "@/repositories/orgs";
import { SignOutButton } from "@/components/SignOutButton";
import { ArchMark } from "@/components/ArchMark";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { setActiveOrgAction } from "./orgActions";

// The admin app is per-user, per-org and session-dependent — never static.
export const dynamic = "force-dynamic";

/**
 * Admin shell. Middleware guarantees a session cookie exists; here we do the
 * real verification (getAppUser) and resolve the active org + role. No org
 * access → a friendly "no access" screen rather than a redirect loop.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getAppUser();
  if (!user) redirect("/auth/signin");

  const orgId = await resolveActiveOrgId(user);
  if (!orgId) return <NoAccess email={user.email} />;

  const role = roleFor(user, orgId)!;
  const org = await getOrgById(orgId);
  const accessibleOrgs = await listAccessibleOrgs(user);

  const nav = [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/gifts", label: "Gifts" },
    { href: "/app/constituents", label: "Constituents" },
    { href: "/app/pledges", label: "Pledges" },
    { href: "/app/reports", label: "Reports" },
    { href: "/app/funds", label: "Funds" },
    { href: "/app/campaigns", label: "Campaigns" },
    { href: "/app/fundraisers", label: "Fundraisers" },
    { href: "/app/engage", label: "Engage" },
    { href: "/app/assistant", label: "Assistant" },
    { href: "/app/settings", label: "Settings" },
  ];
  if (role === "super_admin") nav.push({ href: "/app/admin/orgs", label: "Admin" });

  return (
    <div style={{ fontFamily: "var(--font-ui)", color: "var(--app-text)", minHeight: "100vh", background: "var(--app-bg)" }}>
      <header style={{ background: "var(--app-surface)", borderBottom: "1px solid var(--app-border)", padding: "0 1.25rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: "1rem", height: 56 }}>
          <Link href="/app/dashboard" style={{ display: "flex", alignItems: "center", gap: ".5rem", textDecoration: "none" }}>
            <ArchMark height={26} />
            <span style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.15rem", color: "var(--ink)" }}>Almonry</span>
          </Link>
          {accessibleOrgs.length > 1 ? (
            <OrgSwitcher
              orgs={accessibleOrgs.map((o) => ({ id: o.id, legal_name: o.legal_name }))}
              activeOrgId={orgId}
              action={setActiveOrgAction}
            />
          ) : (
            org?.legal_name && (
              <span style={{ fontSize: ".78rem", color: "var(--app-text-soft)", background: "var(--parchment-deep)", border: "1px solid var(--app-border)", borderRadius: 999, padding: ".15rem .6rem", whiteSpace: "nowrap" }} title="Active organization">
                {org.legal_name}
              </span>
            )
          )}
          <nav style={{ display: "flex", gap: ".25rem", flex: 1 }}>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} style={{ padding: ".4rem .6rem", borderRadius: 6, color: "#3a352d", textDecoration: "none", fontSize: ".92rem" }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <span style={{ fontSize: ".8rem", color: "var(--app-text-soft)" }}>
            {user.email} · <RoleBadge role={role} />
          </span>
          <SignOutButton style={{ fontSize: ".85rem", color: "var(--brand)" }} />
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1.25rem 4rem" }}>{children}</main>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = role === "super_admin" ? "Super Admin" : role === "org_admin" ? "Org Admin" : "Staff";
  return <strong style={{ color: "var(--brand)" }}>{label}</strong>;
}

function NoAccess({ email }: { email: string }) {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", padding: "0 1.25rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.4rem" }}>No organization access</h1>
      <p style={{ color: "#555" }}>
        You’re signed in as <strong>{email}</strong>, but your account isn’t a member of any
        organization yet. Ask an administrator to grant you access.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <SignOutButton style={{ color: "var(--brand)" }} />
      </p>
    </main>
  );
}
