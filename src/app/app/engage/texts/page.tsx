import Link from "next/link";
import { flags } from "@/lib/featureFlags";
import { getAuthContext, canManage } from "@/lib/auth";
import { listMessages } from "@/repositories/engage/messages";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, type Tone } from "@/components/ui/Badge";
import { SubTabs } from "@/components/ui/SubTabs";
import type { EngageMessage, MessageStatus } from "@/types/engage";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; statuses: MessageStatus[] }[] = [
  { key: "sent", label: "Sent", statuses: ["sent"] },
  { key: "outbox", label: "Outbox", statuses: ["scheduled", "sending"] },
  { key: "drafts", label: "Drafts", statuses: ["draft", "failed"] },
];
const statusTone: Record<MessageStatus, Tone> = { draft: "neutral", scheduled: "info", sending: "info", sent: "success", failed: "danger" };

export default async function TextsPage({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string }> }) {
  if (!flags().engageSms) {
    return (
      <div style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "3rem", background: "#fff" }}>
        <EmptyState
          icon="💬"
          title="Reach donors by text"
          description="SMS lets you send quick, high-open-rate updates and appeals. Set ENGAGE_SMS_ENABLED plus your Twilio credentials to turn it on. Texting requires per-contact opt-in (TCPA); STOP is handled automatically."
        />
      </div>
    );
  }

  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { tab = "sent", msg } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const messages = await listMessages(ctx.orgId, { channel: "sms", status: active.statuses });

  const columns: Column<EngageMessage>[] = [
    { key: "name", header: "Name", render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: "recipient_count", header: "Recipients", align: "right" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: "sent_at", header: "Sent", render: (r) => (r.sent_at ? new Date(r.sent_at).toLocaleDateString() : "—") },
    { key: "status", header: "Status", render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <SubTabs items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/app/engage/texts?tab=${t.key}` }))} active={active.key} />
        {canManage(ctx.role) && <Link href="/app/engage/texts/new" style={btnPrimary}>New text</Link>}
      </div>
      {msg === "saved" && <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>Draft saved.</div>}

      <DataTable
        columns={columns}
        rows={messages}
        rowActions={(r) => <Link href={`/app/engage/texts/${r.id}`} style={{ color: "var(--brand)", fontSize: ".85rem" }}>{r.status === "draft" ? "Edit" : "View"}</Link>}
        empty={<EmptyState icon="💬" title={`No ${active.label.toLowerCase()} yet`} description="Send a text to your opted-in donors." action={canManage(ctx.role) ? <Link href="/app/engage/texts/new" style={btnPrimary}>New text</Link> : undefined} />}
      />
    </div>
  );
}
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
