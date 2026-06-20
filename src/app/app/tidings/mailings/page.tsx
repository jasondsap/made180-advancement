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
  { key: "generated", label: "Generated", statuses: ["sent"] },
  { key: "drafts", label: "Drafts", statuses: ["draft"] },
];
const statusTone: Record<MessageStatus, Tone> = { draft: "neutral", scheduled: "info", sending: "info", sent: "success", failed: "danger" };

export default async function MailingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string }> }) {
  if (!flags().engageMailings) {
    return (
      <div style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "3rem", background: "#fff" }}>
        <EmptyState
          icon="✉"
          title="Printed mailings"
          description="Generate merged letters for your donors — appeal letters, year-end summaries, acknowledgments. Set ENGAGE_MAILINGS_ENABLED to turn it on."
        />
      </div>
    );
  }

  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { tab = "generated", msg } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const messages = await listMessages(ctx.orgId, { channel: "mail", status: active.statuses });

  const columns: Column<EngageMessage>[] = [
    { key: "name", header: "Name", render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: "recipient_count", header: "Letters", align: "right" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: "status", header: "Status", render: (r) => <Badge tone={statusTone[r.status]}>{r.status === "sent" ? "generated" : r.status}</Badge> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <SubTabs items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/app/tidings/mailings?tab=${t.key}` }))} active={active.key} />
        {canManage(ctx.role) && <Link href="/app/tidings/mailings/new" style={btnPrimary}>New mailing</Link>}
      </div>
      {msg === "saved" && <Banner>Draft saved.</Banner>}

      <DataTable
        columns={columns}
        rows={messages}
        rowActions={(r) => <Link href={`/app/tidings/mailings/${r.id}`} style={{ color: "var(--brand)", fontSize: ".85rem" }}>{r.status === "draft" ? "Edit" : "View"}</Link>}
        empty={<EmptyState icon="✉" title={`No ${active.label.toLowerCase()} yet`} description="Compose a letter and generate a print-ready PDF." action={canManage(ctx.role) ? <Link href="/app/tidings/mailings/new" style={btnPrimary}>New mailing</Link> : undefined} />}
      />
    </div>
  );
}
function Banner({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>{children}</div>;
}
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
