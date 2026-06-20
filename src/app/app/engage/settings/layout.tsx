import type { ReactNode } from "react";
import { getAuthContext } from "@/lib/auth";
import { hasVerifiedDomain } from "@/repositories/engage/domains";
import { listSenders } from "@/repositories/engage/senders";
import { getAddressByType } from "@/repositories/engage/addresses";
import { SettingsNav } from "@/components/engage/SettingsNav";

export const dynamic = "force-dynamic";

export default async function EngageSettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const [domains, senders, orgAddr] = await Promise.all([
    hasVerifiedDomain(ctx.orgId),
    listSenders(ctx.orgId),
    getAddressByType(ctx.orgId, "organization"),
  ]);

  return (
    <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
      <SettingsNav status={{ domains, senders: senders.length > 0, addresses: Boolean(orgAddr) }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
