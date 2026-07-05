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
 * Atomically claim an event. Returns true if WE claimed it (first delivery, OR a
 * retry of a previously-FAILED event), false if it already exists in a terminal
 * or in-flight state (`processed`/`received` → caller should ack & skip).
 *
 * The `error` re-claim is critical: without it, a transient failure while
 * recording a gift (DB blip, Stripe API timeout) marks the row `error` and 500s
 * so Stripe retries — but a plain DO NOTHING would then treat the retry as a
 * duplicate and ack it, losing the gift forever. Reprocessing is safe because
 * the downstream gift insert is idempotent on the payment-intent id.
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
    ON CONFLICT (stripe_event_id) DO UPDATE
      SET status = 'received',
          payload = EXCLUDED.payload,
          org_id = COALESCE(EXCLUDED.org_id, webhook_events.org_id),
          processed_at = NULL
      WHERE webhook_events.status = 'error'
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

export interface WebhookErrorRow {
  stripe_event_id: string;
  type: string | null;
  org_id: string | null;
  handler_error: string | null;
  created_at: Date;
}

/**
 * Recent failed events for the super_admin console — so a broken webhook is
 * visible in-product, not only in CloudWatch. (Stripe retries re-claim these
 * rows automatically; anything still 'error' after retries needs a human.)
 */
export async function listRecentWebhookErrors(limit = 25): Promise<WebhookErrorRow[]> {
  return (await sql`
    SELECT stripe_event_id, type, org_id,
           payload->>'handler_error' AS handler_error,
           created_at
    FROM webhook_events
    WHERE status = 'error'
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 100)}
  `) as unknown as WebhookErrorRow[];
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
