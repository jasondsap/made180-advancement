import { requireEnv } from "@/lib/env";
import { sendEngageEmail } from "@/lib/email";
import { makeUnsubscribeToken } from "@/lib/engageTokens";
import { buildEmailHtml, renderMergeTags } from "@/domain/engage/render";
import { getOrgById } from "@/repositories/orgs";
import { getMessage, setMessageStatus } from "@/repositories/engage/messages";
import { getSender, getDefaultSender } from "@/repositories/engage/senders";
import { listMergeFields } from "@/repositories/engage/mergeFields";
import { getAddressByType } from "@/repositories/engage/addresses";
import { resolveAudience } from "@/repositories/engage/audience";
import { bulkInsertRecipients, listQueued, setRecipientSent, setRecipientFailed } from "@/repositories/engage/recipients";
import { bulkLogInteractions } from "@/repositories/interactions";
import type { AudienceSpec } from "@/types/engage";

/**
 * Send an email message end-to-end: resolve audience (consent-filtered), fan
 * out recipient rows, then send each via Resend with per-recipient merge
 * rendering + unsubscribe link, recording provider ids and failures.
 *
 * v1 sends synchronously in a loop — fine for typical nonprofit lists. Large
 * lists would move this behind a queue/cron drainer (see the plan doc).
 */
export async function sendEmailMessage(
  orgId: string,
  messageId: string,
): Promise<{ total: number; sent: number; failed: number }> {
  const message = await getMessage(orgId, messageId);
  if (!message) throw new Error("Message not found");
  if (message.channel !== "email") throw new Error("Not an email message");
  if (message.status !== "draft" && message.status !== "scheduled") {
    throw new Error(`Cannot send a message in status '${message.status}'`);
  }
  if (!message.body_md || !message.subject) throw new Error("Subject and body are required");

  const org = await getOrgById(orgId);
  if (!org) throw new Error("Org not found");

  const sender = message.sender_id ? await getSender(orgId, message.sender_id) : await getDefaultSender(orgId);
  const mergeFields = await listMergeFields(orgId);
  const orgAddress = await getAddressByType(orgId, "organization");

  const audience = (message.audience_json ?? { mode: "all" }) as AudienceSpec;
  const constituents = await resolveAudience(orgId, audience, "email");

  await setMessageStatus(orgId, messageId, "sending");
  await bulkInsertRecipients(
    orgId,
    messageId,
    constituents.map((c) => ({ constituentId: c.id, toEmail: c.email })),
  );

  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const byId = new Map(constituents.map((c) => [c.id, c]));
  const queued = await listQueued(orgId, messageId);

  let sent = 0;
  let failed = 0;
  const sentConstituentIds: string[] = [];
  for (const r of queued) {
    const c = r.constituent_id ? byId.get(r.constituent_id) : undefined;
    if (!c || !r.to_email) {
      await setRecipientFailed(orgId, r.id, "Missing recipient/email");
      failed++;
      continue;
    }
    try {
      const html = buildEmailHtml({
        org,
        constituent: c,
        bodyMd: message.body_md,
        mergeFields,
        orgAddress,
        unsubscribeUrl: `${base}/u/${makeUnsubscribeToken(orgId, c.id)}`,
      });
      const { id } = await sendEngageEmail({
        fromName: sender?.from_name ?? org.legal_name,
        fromEmail: sender?.from_email ?? org.receipt_from_email,
        replyTo: sender?.reply_to ?? null,
        to: r.to_email,
        subject: renderMergeTags(message.subject, c, mergeFields),
        html,
        unsubscribeUrl: `${base}/u/${makeUnsubscribeToken(orgId, c.id)}`,
      });
      await setRecipientSent(orgId, r.id, id);
      sent++;
      sentConstituentIds.push(c.id);
    } catch (e) {
      await setRecipientFailed(orgId, r.id, e instanceof Error ? e.message : "send error");
      failed++;
    }
  }

  // Auto-log each delivered email onto the constituent timeline (best-effort).
  await bulkLogInteractions(
    orgId,
    sentConstituentIds.map((cid) => ({ constituentId: cid, type: "email", subject: message.subject })),
  ).catch(() => {});

  await setMessageStatus(orgId, messageId, sent > 0 || queued.length === 0 ? "sent" : "failed", {
    recipientCount: queued.length,
    sentAt: new Date(),
  });
  return { total: queued.length, sent, failed };
}
