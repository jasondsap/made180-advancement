import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getFundraiser } from "@/repositories/fundraisers";
import { getOrgById } from "@/repositories/orgs";
import { listMembers, type P2PMemberWithRaised } from "@/repositories/p2pMembers";
import { DataTable, type Column } from "@/components/ui/DataTable";

export const dynamic = "force-dynamic";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const [fr, org] = await Promise.all([getFundraiser(ctx.orgId, id), getOrgById(ctx.orgId)]);
  if (!fr || !org) notFound();
  const members = await listMembers(ctx.orgId, id);

  const columns: Column<P2PMemberWithRaised>[] = [
    { key: "name", header: "Fundraiser", render: (m) => (
      <a href={`/give/${org.slug}/${fr.slug}/p/${m.slug}`} target="_blank" rel="noreferrer" style={{ color: "var(--brand)", fontWeight: 600 }}>{m.name}</a>
    ) },
    { key: "raised_cents", header: "Raised", align: "right", render: (m) => usd(m.raised_cents) },
    { key: "goal_cents", header: "Goal", align: "right", render: (m) => (m.goal_cents != null ? usd(m.goal_cents) : "—") },
    { key: "supporter_count", header: "Donors", align: "right" },
    { key: "created_at", header: "Joined", render: (m) => new Date(m.created_at).toLocaleDateString() },
  ];

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href={`/app/fundraisers/${id}/edit`} style={{ color: "var(--brand)", fontSize: ".88rem" }}>← {fr.title}</Link>
      </p>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: "0 0 .25rem" }}>Peer-to-peer fundraisers</h1>
      <p style={{ color: "#7a7367", fontSize: ".9rem", margin: "0 0 1rem" }}>{members.length} fundraiser(s) · {usd(members.reduce((s, m) => s + m.raised_cents, 0))} raised together.</p>
      <DataTable columns={columns} rows={members} empty={<p style={{ color: "#999", textAlign: "center" }}>No one has started a page yet.</p>} />
    </div>
  );
}
