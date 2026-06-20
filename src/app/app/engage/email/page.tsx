import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { listMessages } from "@/repositories/engage/messages";
import { hasVerifiedDomain } from "@/repositories/engage/domains";
import { listSenders } from "@/repositories/engage/senders";
import { listAddresses } from "@/repositories/engage/addresses";
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

const statusTone: Record<MessageStatus, Tone> = {
  draft: "neutral", scheduled: "info", sending: "info", sent: "success", failed: "danger",
};

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { tab = "sent", msg } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  const messages = await listMessages(ctx.orgId, { channel: "email", status: active.statuses });

  // Onboarding signal for the empty/first-run experience.
  const [domainOk, senders, addresses] = await Promise.all([
    hasVerifiedDomain(ctx.orgId),
    listSenders(ctx.orgId),
    listAddresses(ctx.orgId),
  ]);
  const ready = domainOk && senders.length > 0 && addresses.some((a) => a.type === "organization");

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
        <SubTabs items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/app/engage/email?tab=${t.key}` }))} active={active.key} />
        {canManage(ctx.role) && <Link href="/app/engage/email/new" style={btnPrimary}>New email</Link>}
      </div>

      {msg === "saved" && <Banner>Draft saved.</Banner>}
      {!ready && (
        <div style={{ border: "1px solid var(--app-border)", background: "#fbf7ee", borderRadius: 10, padding: "1rem", marginBottom: "1rem", fontSize: ".9rem" }}>
          <strong>Finish setup to send:</strong>{" "}
          <Link href="/app/engage/settings/domains" style={{ color: "var(--brand)" }}>verify a domain</Link>,{" "}
          <Link href="/app/engage/settings/senders" style={{ color: "var(--brand)" }}>add a sender</Link>, and{" "}
          <Link href="/app/engage/settings/addresses" style={{ color: "var(--brand)" }}>set your org address</Link>.
        </div>
      )}

      <DataTable
        columns={columns}
        rows={messages}
        rowActions={(r) => <Link href={`/app/engage/email/${r.id}`} style={{ color: "var(--brand)", fontSize: ".85rem" }}>{r.status === "draft" ? "Edit" : "View"}</Link>}
        empty={<EmptyState icon="✉" title={`No ${active.label.toLowerCase()} yet`} description="Create an email to reach your donors." action={canManage(ctx.role) ? <Link href="/app/engage/email/new" style={btnPrimary}>New email</Link> : undefined} />}
      />
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>{children}</div>;
}
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
