import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Registrant } from "@/types/db";

/** Event registrants (paid ticket lines). */

export async function listRegistrants(orgId: string, fundraiserId: string): Promise<Registrant[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM registrants
    WHERE org_id = ${orgId} AND fundraiser_id = ${fundraiserId}
    ORDER BY created_at DESC
  `) as unknown as Registrant[];
}

/** Idempotent insert per (checkout session, ticket type) — safe on webhook replay. */
export async function insertRegistrant(
  orgId: string,
  r: {
    fundraiserId: string;
    ticketTypeId: string | null;
    constituentId: string | null;
    name: string | null;
    email: string | null;
    quantity: number;
    amountCents: number;
    stripeCheckoutSessionId: string | null;
    stripePaymentIntentId: string | null;
  },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    INSERT INTO registrants (
      org_id, fundraiser_id, ticket_type_id, constituent_id, name, email,
      quantity, amount_cents, status, stripe_checkout_session_id, stripe_payment_intent_id
    ) VALUES (
      ${orgId}, ${r.fundraiserId}, ${r.ticketTypeId}, ${r.constituentId}, ${r.name}, ${r.email},
      ${r.quantity}, ${r.amountCents}, 'confirmed', ${r.stripeCheckoutSessionId}, ${r.stripePaymentIntentId}
    )
    ON CONFLICT (stripe_checkout_session_id, ticket_type_id) WHERE stripe_checkout_session_id IS NOT NULL
    DO NOTHING
  `;
}
