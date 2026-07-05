import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getFundraiser } from "@/repositories/fundraisers";
import { listRegistrants } from "@/repositories/registrants";
import { listTicketTypes } from "@/repositories/ticketTypes";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { toggleCheckinAction } from "../../actions";
import type { Registrant } from "@/types/db";

export const dynamic = "force-dynamic";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Registrant list doubles as the event-day check-in surface: search by name or
 * email, tap Check in / Undo. Works fine from a phone at the door.
 */
export default async function RegistrantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { q = "" } = await searchParams;
  const fr = await getFundraiser(ctx.orgId, id);
  if (!fr) notFound();

  const [allRegistrants, tickets] = await Promise.all([
    listRegistrants(ctx.orgId, id),
    listTicketTypes(ctx.orgId, id),
  ]);
  const ticketName = new Map(tickets.map((t) => [t.id, t.name]));

  const needle = q.trim().toLowerCase();
  const registrants = needle
    ? allRegistrants.filter(
        (r) => (r.name ?? "").toLowerCase().includes(needle) || (r.email ?? "").toLowerCase().includes(needle),
      )
    : allRegistrants;

  const confirmed = allRegistrants.filter((r) => r.status === "confirmed");
  const totalAttendees = confirmed.reduce((s, r) => s + r.quantity, 0);
  const checkedIn = confirmed.filter((r) => r.checked_in_at).reduce((s, r) => s + r.quantity, 0);

  const columns: Column<Registrant>[] = [
    { key: "name", header: "Registrant", render: (r) => r.name || r.email || "—" },
    { key: "email", header: "Email", render: (r) => r.email ?? "—" },
    { key: "ticket_type_id", header: "Ticket", render: (r) => (r.ticket_type_id ? ticketName.get(r.ticket_type_id) ?? "—" : "—") },
    { key: "quantity", header: "Qty", align: "right" },
    { key: "amount_cents", header: "Amount", align: "right", render: (r) => usd(r.amount_cents) },
    {
      key: "checked_in_at",
      header: "Check-in",
      render: (r) => (
        <form action={toggleCheckinAction} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="fundraiserId" value={id} />
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="to" value={r.checked_in_at ? "out" : "in"} />
          {r.checked_in_at ? (
            <button type="submit" title={`Checked in ${new Date(r.checked_in_at).toLocaleTimeString()}`} style={{ ...ckBtn, background: "#edf1ec", color: "var(--forest)", borderColor: "#cfe0d6" }}>
              ✓ In · undo
            </button>
          ) : (
            <button type="submit" style={ckBtn}>Check in</button>
          )}
        </form>
      ),
    },
  ];

  return (
    <div>
      <p style={{ marginBottom: ".5rem" }}>
        <Link href={`/app/fundraisers/${id}/edit`} style={{ color: "var(--brand)", fontSize: ".88rem" }}>← {fr.title}</Link>
      </p>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: "0 0 .25rem" }}>Registrants</h1>
      <p style={{ color: "#7a7367", fontSize: ".9rem", margin: "0 0 1rem" }}>
        {totalAttendees} ticket(s) across {allRegistrants.length} order(s) · {checkedIn}/{totalAttendees} checked in · {usd(fr.raised_cents)} raised.
      </p>

      <form method="get" style={{ display: "flex", gap: ".5rem", marginBottom: "1rem", maxWidth: 420 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email…"
          style={{ flex: 1, padding: ".55rem .7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".95rem" }}
        />
        <button type="submit" style={{ padding: ".55rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" }}>
          Search
        </button>
      </form>

      <DataTable columns={columns} rows={registrants} empty={<p style={{ color: "#999", textAlign: "center" }}>{needle ? "No matches." : "No registrants yet."}</p>} />
    </div>
  );
}

const ckBtn: React.CSSProperties = { padding: ".35rem .7rem", borderRadius: 7, background: "#fff", color: "var(--brand)", border: "1px solid var(--brand)", fontSize: ".82rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
