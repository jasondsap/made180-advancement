import Link from "next/link";
import { notFound } from "next/navigation";
import { flags } from "@/lib/featureFlags";
import { getAuthContext, canManage } from "@/lib/auth";
import { listFunds } from "@/repositories/funds";
import { MailingComposer } from "../MailingComposer";
import { saveMailingDraftAction, generateMailingAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewMailingPage() {
  if (!flags().engageMailings) notFound();
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) return <p style={{ color: "#999" }}>Creating mailings requires an admin role.</p>;
  const funds = await listFunds(ctx.orgId, { activeOnly: true });

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/engage/mailings" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Mailings</Link>
      </p>
      <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>New mailing</h2>
      <MailingComposer
        funds={funds.map((f) => ({ id: f.id, name: f.name }))}
        saveDraftAction={saveMailingDraftAction}
        generateAction={generateMailingAction}
      />
    </div>
  );
}
