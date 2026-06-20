import { requireEnv } from "@/lib/env";
import { sendSms } from "@/lib/twilio";
import { renderMergeTags } from "@/domain/engage/render";
import { getMessage, setMessageStatus } from "@/repositories/engage/messages";
import { listMergeFields } from "@/repositories/engage/mergeFields";
import { resolveAudience } from "@/repositories/engage/audience";
import { bulkInsertRecipients, listQueued, setRecipientSent, setRecipientFailed } from "@/repositories/engage/recipients";
import type { AudienceSpec } from "@/types/engage";

/** Footer appended to the first message to a contact (TCPA opt-out reminder). */
const STOP_FOOTER = "\nReply STOP to opt out.";

/**
 * Send an SMS message: resolve a consent-filtered audience (sms_opt_in required),
 * fan out recipients, render merge tags per contact, and send via Twilio with a
 * delivery status callback. v1 sends synchronously (fine for typical lists).
 */
export async function sendSmsMessage(
  orgId: string,
  messageId: string,
): Promise<{ total: number; sent: number; failed: number }> {
  const message = await getMessage(orgId, messageId);
  if (!message) throw new Error("Message not found");
  if (message.channel !== "sms") throw new Error("Not an SMS message");
  if (message.status !== "draft" && message.status !== "scheduled") {
    throw new Error(`Cannot send a message in status '${message.status}'`);
  }
  if (!message.body_md) throw new Error("Message body is required");

  const mergeFields = await listMergeFields(orgId);
  const audience = (message.audience_json ?? { mode: "all" }) as AudienceSpec;
  const constituents = await resolveAudience(orgId, audience, "sms");

  await setMessageStatus(orgId, messageId, "sending");
  await bulkInsertRecipients(orgId, messageId, constituents.map((c) => ({ constituentId: c.id, toPhone: c.phone })));

  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const statusCallback = `${base}/api/tidings/webhook/twilio`;
  const byId = new Map(constituents.map((c) => [c.id, c]));
  const queued = await listQueued(orgId, messageId);

  let sent = 0;
  let failed = 0;
  for (const r of queued) {
    const c = r.constituent_id ? byId.get(r.constituent_id) : undefined;
    if (!c || !r.to_phone) {
      await setRecipientFailed(orgId, r.id, "Missing recipient/phone");
      failed++;
      continue;
    }
    try {
      const body = renderMergeTags(message.body_md, c, mergeFields) + STOP_FOOTER;
      const { sid } = await sendSms({ to: r.to_phone, body, statusCallback });
      await setRecipientSent(orgId, r.id, sid);
      sent++;
    } catch (e) {
      await setRecipientFailed(orgId, r.id, e instanceof Error ? e.message : "send error");
      failed++;
    }
  }

  await setMessageStatus(orgId, messageId, sent > 0 || queued.length === 0 ? "sent" : "failed", {
    recipientCount: queued.length,
    sentAt: new Date(),
  });
  return { total: queued.length, sent, failed };
}
