import Link from "next/link";
import { notFound } from "next/navigation";
import { flags } from "@/lib/featureFlags";
import { getAuthContext, canManage } from "@/lib/auth";
import { listFunds } from "@/repositories/funds";
import { SmsComposer } from "../SmsComposer";
import { saveSmsDraftAction, sendSmsNowAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewTextPage() {
  if (!flags().engageSms) notFound();
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) return <p style={{ color: "#999" }}>Sending texts requires an admin role.</p>;
  const funds = await listFunds(ctx.orgId, { activeOnly: true });

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/tidings/texts" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Texts</Link>
      </p>
      <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>New text</h2>
      <SmsComposer
        funds={funds.map((f) => ({ id: f.id, name: f.name }))}
        saveDraftAction={saveSmsDraftAction}
        sendNowAction={sendSmsNowAction}
      />
    </div>
  );
}
