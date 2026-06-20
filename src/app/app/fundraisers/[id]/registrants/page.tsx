import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getFundraiser } from "@/repositories/fundraisers";
import { listRegistrants } from "@/repositories/registrants";
import { listTicketTypes } from "@/repositories/ticketTypes";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { Registrant } from "@/types/db";

export const dynamic = "force-dynamic";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function RegistrantsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const fr = await getFundraiser(ctx.orgId, id);
  if (!fr) notFound();

  const [registrants, tickets] = await Promise.all([
    listRegistrants(ctx.orgId, id),
    listTicketTypes(ctx.orgId, id),
  ]);
  const ticketName = new Map(tickets.map((t) => [t.id, t.name]));
  const totalAttendees = registrants.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.quantity, 0);

  const columns: Column<Registrant>[] = [
    { key: "name", header: "Registrant", render: (r) => r.name || r.email || "—" },
    { key: "email", header: "Email", render: (r) => r.email ?? "—" },
    { key: "ticket_type_id", header: "Ticket", render: (r) => (r.ticket_type_id ? ticketName.get(r.ticket_type_id) ?? "—" : "—") },
    { key: "quantity", header: "Qty", align: "right" },
    { key: "amount_cents", header: "Amount", align: "right", render: (r) => usd(r.amount_cents) },
    { key: "created_at", header: "Date", render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href={`/app/fundraisers/${id}/edit`} style={{ color: "var(--brand)", fontSize: ".88rem" }}>← {fr.title}</Link>
      </p>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: "0 0 .25rem" }}>Registrants</h1>
      <p style={{ color: "#7a7367", fontSize: ".9rem", margin: "0 0 1rem" }}>
        {totalAttendees} ticket(s) across {registrants.length} order(s) · {usd(fr.raised_cents)} raised.
      </p>
      <DataTable columns={columns} rows={registrants} empty={<p style={{ color: "#999", textAlign: "center" }}>No registrants yet.</p>} />
    </div>
  );
}
