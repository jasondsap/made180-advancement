import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { orgFlags } from "@/lib/featureFlags";
import { listSenders } from "@/repositories/engage/senders";
import { listFunds } from "@/repositories/funds";
import { listSegments } from "@/repositories/engage/segments";
import { getConnectionByUserId } from "@/repositories/canvaConnections";
import { EmailComposer } from "../EmailComposer";
import { saveEmailDraftAction, sendEmailNowAction, scheduleEmailAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewEmailPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) return <p style={{ color: "#999" }}>Sending email requires an admin role.</p>;

  const [senders, funds, segments] = await Promise.all([
    listSenders(ctx.orgId),
    listFunds(ctx.orgId, { activeOnly: true }),
    listSegments(ctx.orgId),
  ]);
  const canvaEnabled = (await orgFlags(ctx.orgId)).canva;
  const canvaConnected = canvaEnabled && Boolean(await getConnectionByUserId(ctx.user.id));

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/tidings/email" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Emails</Link>
      </p>
      <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>New email</h2>
      <EmailComposer
        senders={senders.map((s) => ({ id: s.id, label: `${s.from_name} <${s.from_email}>` }))}
        funds={funds.map((f) => ({ id: f.id, name: f.name }))}
        segments={segments.map((s) => ({ id: s.id, name: s.name }))}
        saveDraftAction={saveEmailDraftAction}
        sendNowAction={sendEmailNowAction}
        scheduleAction={scheduleEmailAction}
        canvaEnabled={canvaEnabled}
        canvaConnected={canvaConnected}
      />
    </div>
  );
}
