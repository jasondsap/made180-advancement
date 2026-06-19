import { sql } from "@/lib/db";

/**
 * Webhook idempotency ledger.
 *
 * Keyed by the GLOBAL stripe_event_id (unique across all orgs), so these
 * functions are not orgId-first — like the orgs resolver, this is a documented
 * exception: an event is logged before we've parsed which org it belongs to.
 * `org_id` is backfilled via setWebhookEventOrg once known.
 */

/**
 * Atomically claim an event. Returns true if WE inserted it (first delivery),
 * false if it already existed (a Stripe retry/replay → caller should ack & skip).
 */
export async function claimWebhookEvent(e: {
  stripeEventId: string;
  type: string;
  payload: unknown;
  orgId?: string | null;
}): Promise<boolean> {
  const rows = (await sql`
    INSERT INTO webhook_events (stripe_event_id, type, payload, org_id, status)
    VALUES (
      ${e.stripeEventId},
      ${e.type},
      ${JSON.stringify(e.payload)}::jsonb,
      ${e.orgId ?? null},
      'received'
    )
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}

export async function setWebhookEventOrg(stripeEventId: string, orgId: string): Promise<void> {
  await sql`
    UPDATE webhook_events SET org_id = ${orgId} WHERE stripe_event_id = ${stripeEventId}
  `;
}

export async function markWebhookProcessed(stripeEventId: string): Promise<void> {
  await sql`
    UPDATE webhook_events
    SET status = 'processed', processed_at = now()
    WHERE stripe_event_id = ${stripeEventId}
  `;
}

export async function markWebhookError(stripeEventId: string, message: string): Promise<void> {
  await sql`
    UPDATE webhook_events
    SET status = 'error',
        processed_at = now(),
        payload = payload || jsonb_build_object('handler_error', ${message}::text)
    WHERE stripe_event_id = ${stripeEventId}
  `;
}
