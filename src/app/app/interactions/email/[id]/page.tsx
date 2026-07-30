import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { orgFlags } from "@/lib/featureFlags";
import { getMessage } from "@/repositories/engage/messages";
import { statsForMessage, listRecipients } from "@/repositories/engage/recipients";
import { listSenders } from "@/repositories/engage/senders";
import { listFunds } from "@/repositories/funds";
import { listSegments } from "@/repositories/engage/segments";
import { getConnectionByUserId } from "@/repositories/canvaConnections";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, type Tone } from "@/components/ui/Badge";
import { EmailComposer } from "../EmailComposer";
import {
  saveEmailDraftAction, sendEmailNowAction, deleteMessageAction,
  scheduleEmailAction, cancelScheduleAction, resumeEmailSendAction, retryFailedEmailAction,
} from "../../actions";
import type { EngageRecipient, RecipientStatus } from "@/types/engage";

export const dynamic = "force-dynamic";

const recipTone: Record<RecipientStatus, Tone> = {
  queued: "neutral", sent: "info", delivered: "success", opened: "success", clicked: "success",
  bounced: "danger", failed: "danger", unsubscribed: "warning",
};

export default async function MessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { msg } = await searchParams;
  const message = await getMessage(ctx.orgId, id);
  if (!message) notFound();

  // Drafts are editable; reuse the composer.
  if (message.status === "draft" && canManage(ctx.role)) {
    const [senders, funds, segments] = await Promise.all([
      listSenders(ctx.orgId),
      listFunds(ctx.orgId, { activeOnly: true }),
      listSegments(ctx.orgId),
    ]);
    const canvaEnabled = (await orgFlags(ctx.orgId)).canva;
    const canvaConnected = canvaEnabled && Boolean(await getConnectionByUserId(ctx.user.id));
    return (
      <div>
        <Back />
        <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>Edit draft</h2>
        <EmailComposer
          messageId={message.id}
          defaults={{ name: message.name, subject: message.subject ?? "", body: message.body_md ?? "", senderId: message.sender_id }}
          senders={senders.map((s) => ({ id: s.id, label: `${s.from_name} <${s.from_email}>` }))}
          funds={funds.map((f) => ({ id: f.id, name: f.name }))}
          segments={segments.map((s) => ({ id: s.id, name: s.name }))}
          saveDraftAction={saveEmailDraftAction}
          sendNowAction={sendEmailNowAction}
          scheduleAction={scheduleEmailAction}
          canvaEnabled={canvaEnabled}
          canvaConnected={canvaConnected}
        />
        <form action={deleteMessageAction} style={{ marginTop: "1.5rem" }}>
          <input type="hidden" name="id" value={message.id} />
          <button type="submit" style={{ background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", borderRadius: 7, padding: ".4rem .8rem", fontSize: ".85rem", cursor: "pointer" }}>Delete draft</button>
        </form>
      </div>
    );
  }

  const [stats, recipients] = await Promise.all([
    statsForMessage(ctx.orgId, message.id),
    listRecipients(ctx.orgId, message.id),
  ]);

  const columns: Column<EngageRecipient>[] = [
    { key: "to_email", header: "Recipient", render: (r) => r.to_email ?? "—" },
    { key: "status", header: "Status", render: (r) => <Badge tone={recipTone[r.status]}>{r.status}</Badge> },
    { key: "error", header: "Detail", render: (r) => r.error ?? "—" },
  ];

  return (
    <div>
      <Back />
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".5rem" }}>
        <h2 style={{ fontSize: "1.25rem", margin: 0 }}>{message.name}</h2>
        <Badge tone={message.status === "sent" ? "success" : message.status === "failed" ? "danger" : "info"}>{message.status}</Badge>
      </div>
      {msg === "sent" && <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>Email sent to {stats.total} recipient(s).</div>}
      {msg === "sending" && <div style={{ background: "#fff4e5", color: "#7a4f00", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>Send in progress — large lists continue in the background. Use “Resume sending” if it pauses.</div>}
      {msg === "retried" && <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>Failed recipients re-queued and retried.</div>}

      {canManage(ctx.role) && (
        <div style={{ display: "flex", gap: ".6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          {message.status === "sending" && (
            <form action={resumeEmailSendAction}>
              <input type="hidden" name="id" value={message.id} />
              <button type="submit" style={actionBtn}>Resume sending</button>
            </form>
          )}
          {message.status === "scheduled" && (
            <form action={cancelScheduleAction}>
              <input type="hidden" name="id" value={message.id} />
              <button type="submit" style={actionBtn}>Cancel schedule (back to draft)</button>
            </form>
          )}
          {stats.failed > 0 && message.status !== "scheduled" && (
            <form action={retryFailedEmailAction}>
              <input type="hidden" name="id" value={message.id} />
              <button type="submit" style={actionBtn}>Retry {stats.failed} failed</button>
            </form>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: ".75rem", marginBottom: "1.5rem" }}>
        <Stat label="Recipients" value={stats.total} />
        <Stat label="Delivered" value={stats.delivered} />
        <Stat label="Opens" value={`${stats.opened} · ${Math.round(stats.openRate * 100)}%`} />
        <Stat label="Clicks" value={`${stats.clicked} · ${Math.round(stats.clickRate * 100)}%`} />
        <Stat label="Bounced" value={stats.bounced} />
      </div>

      <h3 style={{ fontSize: "1rem", margin: "0 0 .6rem" }}>Recipients</h3>
      <DataTable columns={columns} rows={recipients} empty={<p style={{ color: "#999", textAlign: "center" }}>No recipients.</p>} />
      {stats.total > recipients.length && (
        <p style={{ color: "#888", fontSize: ".82rem", marginTop: ".5rem" }}>
          Showing the first {recipients.length.toLocaleString()} of {stats.total.toLocaleString()} recipients; the tiles above cover everyone.
        </p>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 7, background: "transparent", color: "var(--brand)", border: "1px solid var(--brand)", fontSize: ".85rem", fontWeight: 600, cursor: "pointer" };

function Back() {
  return <p style={{ marginBottom: ".5rem" }}><Link href="/app/interactions/email" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Emails</Link></p>;
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: ".75rem .9rem", background: "#fff" }}>
      <div style={{ fontSize: ".75rem", color: "#888", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--ink)" }}>{value}</div>
    </div>
  );
}
