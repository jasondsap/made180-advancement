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

export async function deleteMessage(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM engage_messages WHERE org_id = ${orgId} AND id = ${id} AND status = 'draft'`;
}
