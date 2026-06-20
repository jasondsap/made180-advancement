import Link from "next/link";
import { getAuthContext, canManage } from "@/lib/auth";
import { listFundraisers, type FundraiserWithStats } from "@/repositories/fundraisers";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, type Tone } from "@/components/ui/Badge";
import type { FundraiserStatus, FundraiserType } from "@/types/db";

export const dynamic = "force-dynamic";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const typeLabel: Record<FundraiserType, string> = { donation_form: "Form", fundraising_page: "Page", event: "Event" };
const statusTone: Record<FundraiserStatus, Tone> = { unpublished: "neutral", published: "success", ended: "warning", archived: "neutral" };

export default async function FundraisersPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  const rows = await listFundraisers(ctx.orgId);

  const columns: Column<FundraiserWithStats>[] = [
    { key: "title", header: "Fundraiser", render: (r) => (
      <span style={{ fontWeight: 600 }}>{r.pinned && <span title="Pinned" style={{ marginRight: ".3rem" }}>📌</span>}{r.title}</span>
    ) },
    { key: "type", header: "Type", render: (r) => <Badge tone="info">{typeLabel[r.type]}</Badge> },
    { key: "supporter_count", header: "Supporters", align: "right" },
    { key: "raised_cents", header: "Raised", align: "right", render: (r) => usd(r.raised_cents) },
    { key: "status", header: "Status", render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", margin: 0 }}>Fundraisers</h1>
          <p style={{ color: "#7a7367", margin: ".25rem 0 0", fontSize: ".9rem" }}>Showing {rows.length} result{rows.length === 1 ? "" : "s"}.</p>
        </div>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <a href="/api/fundraisers/export" style={btnGhost}>Export CSV</a>
          {manage && <Link href="/app/fundraisers/new" style={btnPrimary}>New fundraiser</Link>}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowActions={(r) => (
          <Link href={`/app/fundraisers/${r.id}/edit`} style={{ color: "var(--brand)", fontSize: ".85rem" }}>Edit</Link>
        )}
        empty={<EmptyState icon="◎" title="No fundraisers yet" description="Create a donation form or fundraising page to start collecting gifts online." action={manage ? <Link href="/app/fundraisers/new" style={btnPrimary}>New fundraiser</Link> : undefined} />}
      />
    </div>
  );
}

const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
