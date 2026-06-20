import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { listSenders } from "@/repositories/engage/senders";
import { listFunds } from "@/repositories/funds";
import { EmailComposer } from "../EmailComposer";
import { saveEmailDraftAction, sendEmailNowAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewEmailPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) return <p style={{ color: "#999" }}>Sending email requires an admin role.</p>;

  const [senders, funds] = await Promise.all([
    listSenders(ctx.orgId),
    listFunds(ctx.orgId, { activeOnly: true }),
  ]);

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href="/app/engage/email" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Emails</Link>
      </p>
      <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>New email</h2>
      <EmailComposer
        senders={senders.map((s) => ({ id: s.id, label: `${s.from_name} <${s.from_email}>` }))}
        funds={funds.map((f) => ({ id: f.id, name: f.name }))}
        saveDraftAction={saveEmailDraftAction}
        sendNowAction={sendEmailNowAction}
      />
    </div>
  );
}
