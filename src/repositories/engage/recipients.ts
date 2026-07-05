import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { EngageRecipient, RecipientStatus, MessageStats } from "@/types/engage";

/** Per-send recipient rows + delivery tracking. */

export interface NewRecipient {
  constituentId: string | null;
  toEmail?: string | null;
  toPhone?: string | null;
}

/**
 * Fan out a message to its resolved audience. Idempotent per (message,
 * constituent). Single unnest statement — one round-trip for any batch size
 * (a per-row loop here once meant 2,000 sequential queries before the first
 * email went out).
 */
export async function bulkInsertRecipients(orgId: string, messageId: string, rows: NewRecipient[]): Promise<number> {
  assertOrgId(orgId);
  if (rows.length === 0) return 0;
  const conIds = rows.map((r) => r.constituentId);
  const emails = rows.map((r) => r.toEmail ?? null);
  const phones = rows.map((r) => r.toPhone ?? null);
  const res = (await sql`
    INSERT INTO engage_recipients (org_id, message_id, constituent_id, to_email, to_phone)
    SELECT ${orgId}, ${messageId}, u.con_id, u.email, u.phone
    FROM unnest(${conIds}::uuid[], ${emails}::text[], ${phones}::text[]) AS u(con_id, email, phone)
    ON CONFLICT (message_id, constituent_id) WHERE constituent_id IS NOT NULL DO NOTHING
    RETURNING id
  `) as unknown as unknown[];
  return res.length;
}

/** Recipient rows for the detail page — bounded; pair with statsForMessage for true totals. */
export async function listRecipients(orgId: string, messageId: string, limit = 1000): Promise<EngageRecipient[]> {
  assertOrgId(orgId);
  const capped = Math.min(Math.max(limit, 1), 5000);
  return (await sql`
    SELECT * FROM engage_recipients WHERE org_id = ${orgId} AND message_id = ${messageId}
    ORDER BY created_at LIMIT ${capped}
  `) as unknown as EngageRecipient[];
}

export async function listQueued(orgId: string, messageId: string): Promise<EngageRecipient[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM engage_recipients WHERE org_id = ${orgId} AND message_id = ${messageId} AND status = 'queued' ORDER BY created_at
  `) as unknown as EngageRecipient[];
}

/**
 * Atomically claim a batch of queued recipients for delivery by flipping them
 * to 'sent' up front (provider id filled in after the actual send). This makes
 * delivery AT-MOST-ONCE per recipient: two concurrent drainers can never both
 * send to the same row, because only one UPDATE wins each row. The trade-off —
 * a crash between claim and send leaves a 'sent' row with a NULL provider id
 * and no delivery — is the right failure mode for donor email (a missed send
 * beats a double send). Send failures downgrade the row to 'failed'.
 */
export async function claimQueuedBatch(
  orgId: string,
  messageId: string,
  limit: number,
): Promise<EngageRecipient[]> {
  assertOrgId(orgId);
  const capped = Math.min(Math.max(limit, 1), 500);
  return (await sql`
    UPDATE engage_recipients SET status = 'sent'
    WHERE id IN (
      SELECT id FROM engage_recipients
      WHERE org_id = ${orgId} AND message_id = ${messageId} AND status = 'queued'
      ORDER BY created_at
      LIMIT ${capped}
    )
    RETURNING *
  `) as unknown as EngageRecipient[];
}

export async function countQueued(orgId: string, messageId: string): Promise<number> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT count(*)::int AS n FROM engage_recipients
    WHERE org_id = ${orgId} AND message_id = ${messageId} AND status = 'queued'
  `) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

/** Put failed recipients back in the queue (admin "retry failed" action). */
export async function requeueFailed(orgId: string, messageId: string): Promise<number> {
  assertOrgId(orgId);
  const rows = (await sql`
    UPDATE engage_recipients SET status = 'queued', error = NULL
    WHERE org_id = ${orgId} AND message_id = ${messageId} AND status = 'failed'
    RETURNING id
  `) as unknown as unknown[];
  return rows.length;
}

export async function setRecipientSent(orgId: string, id: string, providerMessageId: string | null): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE engage_recipients SET status = 'sent', provider_message_id = ${providerMessageId}
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function setRecipientFailed(orgId: string, id: string, error: string): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE engage_recipients SET status = 'failed', error = ${error.slice(0, 500)} WHERE org_id = ${orgId} AND id = ${id}`;
}

/**
 * Advance a recipient's delivery status from a provider webhook. Keyed on the
 * globally-unique provider_message_id (Resend/Twilio) — a documented exception
 * to the orgId-first rule, like webhookEvents/gift refunds: the webhook carries
 * no org context, and the provider id already pins exactly one recipient row.
 * Never downgrades a terminal state (e.g. clicked stays clicked after delivered).
 */
export async function advanceStatusByProviderId(
  providerMessageId: string,
  status: RecipientStatus,
  error?: string | null,
): Promise<void> {
  const RANK: Record<RecipientStatus, number> = {
    queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4,
    bounced: 5, failed: 5, unsubscribed: 5,
  };
  await sql`
    UPDATE engage_recipients
    SET status = ${status}, error = COALESCE(${error ?? null}, error)
    WHERE provider_message_id = ${providerMessageId}
      AND ${RANK[status]} >= (
        CASE status
          WHEN 'queued' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2
          WHEN 'opened' THEN 3 WHEN 'clicked' THEN 4 ELSE 5 END
      )
  `;
}

/** Webhook helper: locate a recipient by its provider id (globally unique). */
export async function getByProviderId(providerMessageId: string): Promise<EngageRecipient | undefined> {
  const rows = (await sql`SELECT * FROM engage_recipients WHERE provider_message_id = ${providerMessageId} LIMIT 1`) as unknown as EngageRecipient[];
  return rows[0];
}

export async function statsForMessage(orgId: string, messageId: string): Promise<MessageStats> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status IN ('delivered','opened','clicked'))::int AS delivered,
      count(*) FILTER (WHERE status IN ('opened','clicked'))::int AS opened,
      count(*) FILTER (WHERE status = 'clicked')::int AS clicked,
      count(*) FILTER (WHERE status = 'bounced')::int AS bounced,
      count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM engage_recipients WHERE org_id = ${orgId} AND message_id = ${messageId}
  `) as unknown as { total: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number }[];
  const r = rows[0] ?? { total: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
  return {
    ...r,
    openRate: r.delivered > 0 ? r.opened / r.delivered : 0,
    clickRate: r.delivered > 0 ? r.clicked / r.delivered : 0,
  };
}
