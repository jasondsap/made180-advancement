import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { TicketType } from "@/types/db";

/** Ticket types for an event fundraiser. `sold` is derived from confirmed registrants. */
export interface TicketTypeWithSold extends TicketType {
  sold: number;
}

export async function listTicketTypes(orgId: string, fundraiserId: string): Promise<TicketTypeWithSold[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT t.*, COALESCE(r.sold, 0)::int AS sold
    FROM ticket_types t
    LEFT JOIN (
      SELECT ticket_type_id, SUM(quantity) AS sold
      FROM registrants WHERE org_id = ${orgId} AND status = 'confirmed'
      GROUP BY ticket_type_id
    ) r ON r.ticket_type_id = t.id
    WHERE t.org_id = ${orgId} AND t.fundraiser_id = ${fundraiserId}
    ORDER BY t.sort, t.created_at
  `) as unknown as TicketTypeWithSold[];
}

export async function getTicketType(orgId: string, id: string): Promise<TicketType | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM ticket_types WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as TicketType[];
  return rows[0];
}

export async function createTicketType(
  orgId: string,
  fundraiserId: string,
  t: { name: string; description?: string | null; priceCents: number; capacity?: number | null; sort?: number },
): Promise<TicketType> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO ticket_types (org_id, fundraiser_id, name, description, price_cents, capacity, sort)
    VALUES (${orgId}, ${fundraiserId}, ${t.name.trim()}, ${t.description ?? null}, ${t.priceCents}, ${t.capacity ?? null}, ${t.sort ?? 0})
    RETURNING *
  `) as unknown as TicketType[];
  return rows[0]!;
}

export async function updateTicketType(
  orgId: string,
  id: string,
  t: { name: string; description: string | null; priceCents: number; capacity: number | null; active: boolean },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE ticket_types SET
      name = ${t.name.trim()}, description = ${t.description}, price_cents = ${t.priceCents},
      capacity = ${t.capacity}, active = ${t.active}
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function deleteTicketType(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM ticket_types WHERE org_id = ${orgId} AND id = ${id}`;
}

/** Public-page resolver: active ticket types + remaining capacity, by fundraiser. */
export async function listPublicTicketTypes(fundraiserId: string): Promise<TicketTypeWithSold[]> {
  return (await sql`
    SELECT t.*, COALESCE(r.sold, 0)::int AS sold
    FROM ticket_types t
    LEFT JOIN (
      SELECT ticket_type_id, SUM(quantity) AS sold
      FROM registrants WHERE status = 'confirmed'
      GROUP BY ticket_type_id
    ) r ON r.ticket_type_id = t.id
    WHERE t.fundraiser_id = ${fundraiserId} AND t.active = true
    ORDER BY t.sort, t.created_at
  `) as unknown as TicketTypeWithSold[];
}
