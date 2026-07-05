import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { EngageMessage, EngageChannel, MessageStatus, AudienceSpec } from "@/types/engage";

/** Engage messages (email/SMS/mail campaigns). All queries org-scoped. */

export async function listMessages(
  orgId: string,
  opts: { channel: EngageChannel; status?: MessageStatus | MessageStatus[] },
): Promise<EngageMessage[]> {
  assertOrgId(orgId);
  const statuses = opts.status ? (Array.isArray(opts.status) ? opts.status : [opts.status]) : null;
  if (statuses) {
    return (await sql`
      SELECT * FROM engage_messages
      WHERE org_id = ${orgId} AND channel = ${opts.channel} AND status = ANY(${statuses}::text[])
      ORDER BY coalesce(sent_at, updated_at) DESC
    `) as unknown as EngageMessage[];
  }
  return (await sql`
    SELECT * FROM engage_messages
    WHERE org_id = ${orgId} AND channel = ${opts.channel}
    ORDER BY coalesce(sent_at, updated_at) DESC
  `) as unknown as EngageMessage[];
}

export async function getMessage(orgId: string, id: string): Promise<EngageMessage | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM engage_messages WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as EngageMessage[];
  return rows[0];
}

export async function createMessage(
  orgId: string,
  m: {
    channel: EngageChannel;
    name: string;
    subject?: string | null;
    bodyMd?: string | null;
    senderId?: string | null;
    audience?: AudienceSpec | null;
    createdBy?: string | null;
  },
): Promise<EngageMessage> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO engage_messages (org_id, channel, name, subject, body_md, sender_id, audience_json, created_by)
    VALUES (
      ${orgId}, ${m.channel}, ${m.name.trim()}, ${m.subject ?? null}, ${m.bodyMd ?? null},
      ${m.senderId ?? null}, ${m.audience ? JSON.stringify(m.audience) : null}::jsonb, ${m.createdBy ?? null}
    )
    RETURNING *
  `) as unknown as EngageMessage[];
  return rows[0]!;
}

export async function updateMessage(
  orgId: string,
  id: string,
  m: { name: string; subject?: string | null; bodyMd?: string | null; senderId?: string | null; audience?: AudienceSpec | null },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE engage_messages SET
      name = ${m.name.trim()},
      subject = ${m.subject ?? null},
      body_md = ${m.bodyMd ?? null},
      sender_id = ${m.senderId ?? null},
      audience_json = ${m.audience ? JSON.stringify(m.audience) : null}::jsonb
    WHERE org_id = ${orgId} AND id = ${id} AND status = 'draft'
  `;
}

/**
 * Atomically claim a message for sending: draft/scheduled → sending, in one
 * compare-and-set. Returns the message iff WE claimed it — a concurrent second
 * "Send now" (double-click, double-submit) gets undefined instead of a second
 * send. This is the only path that may move a message into 'sending'.
 */
export async function claimMessageForSending(orgId: string, id: string): Promise<EngageMessage | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    UPDATE engage_messages SET status = 'sending'
    WHERE org_id = ${orgId} AND id = ${id} AND status IN ('draft', 'scheduled')
    RETURNING *
  `) as unknown as EngageMessage[];
  return rows[0];
}

/** Schedule a draft for later delivery (cron drains due messages). CAS from draft. */
export async function scheduleMessage(orgId: string, id: string, at: Date): Promise<boolean> {
  assertOrgId(orgId);
  const rows = (await sql`
    UPDATE engage_messages SET status = 'scheduled', scheduled_at = ${at.toISOString()}
    WHERE org_id = ${orgId} AND id = ${id} AND status = 'draft'
    RETURNING id
  `) as unknown as unknown[];
  return rows.length > 0;
}

/** Un-schedule back to draft (only while still scheduled). */
export async function cancelSchedule(orgId: string, id: string): Promise<boolean> {
  assertOrgId(orgId);
  const rows = (await sql`
    UPDATE engage_messages SET status = 'draft', scheduled_at = NULL
    WHERE org_id = ${orgId} AND id = ${id} AND status = 'scheduled'
    RETURNING id
  `) as unknown as unknown[];
  return rows.length > 0;
}

export interface CronMessageRef {
  org_id: string;
  id: string;
  channel: EngageChannel;
}

/**
 * Cross-org resolvers for the cron drainer (/api/tidings/cron) — a documented
 * exception to orgId-first: the cron tick has no org context and must sweep
 * every tenant. Only ids/channel leave this function; all actual work goes
 * back through org-scoped paths.
 */
export async function listDueScheduledMessages(limit = 20): Promise<CronMessageRef[]> {
  return (await sql`
    SELECT org_id, id, channel FROM engage_messages
    WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT ${Math.min(Math.max(limit, 1), 100)}
  `) as unknown as CronMessageRef[];
}

/** Messages stuck in 'sending' (crashed/timed-out drain) needing a resume. */
export async function listStuckSendingMessages(olderThanMinutes = 10, limit = 20): Promise<CronMessageRef[]> {
  return (await sql`
    SELECT org_id, id, channel FROM engage_messages
    WHERE status = 'sending' AND channel IN ('email', 'sms')
      AND updated_at < now() - (${olderThanMinutes} * interval '1 minute')
    ORDER BY updated_at
    LIMIT ${Math.min(Math.max(limit, 1), 100)}
  `) as unknown as CronMessageRef[];
}

export async function setMessageStatus(
  orgId: string,
  id: string,
  status: MessageStatus,
  opts: { recipientCount?: number; sentAt?: Date } = {},
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE engage_messages SET
      status = ${status},
      recipient_count = COALESCE(${opts.recipientCount ?? null}, recipient_count),
      sent_at = COALESCE(${opts.sentAt ?? null}, sent_at)
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

/** Link a message to the appeal it promotes (campaign Asks flow). */
export async function setMessageAppeal(orgId: string, id: string, appealId: string): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE engage_messages SET appeal_id = ${appealId}
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function deleteMessage(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM engage_messages WHERE org_id = ${orgId} AND id = ${id} AND status = 'draft'`;
}
