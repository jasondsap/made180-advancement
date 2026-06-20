import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { flags } from "@/lib/featureFlags";
import { NewFundraiserWizard } from "../NewFundraiserWizard";
import { createFundraiserAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewFundraiserPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) return <p style={{ color: "#999" }}>Creating fundraisers requires an admin role.</p>;
  const f = flags();

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/fundraisers" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Fundraisers</Link>
      </p>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: "0 0 1.25rem" }}>New fundraiser</h1>
      <NewFundraiserWizard
        flags={{ events: f.fundraiserEvents, p2p: f.fundraiserP2p, auction: f.fundraiserAuction }}
        action={createFundraiserAction}
      />
    </div>
  );
}
