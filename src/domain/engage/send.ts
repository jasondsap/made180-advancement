import { requireEnv } from "@/lib/env";
import { sendEngageEmail } from "@/lib/email";
import { makeUnsubscribeToken } from "@/lib/engageTokens";
import { buildEmailHtml, renderMergeTags } from "@/domain/engage/render";
import { getOrgById } from "@/repositories/orgs";
import {
  getMessage,
  setMessageStatus,
  claimMessageForSending,
} from "@/repositories/engage/messages";
import { getSender, getDefaultSender } from "@/repositories/engage/senders";
import { listMergeFields } from "@/repositories/engage/mergeFields";
import { getAddressByType } from "@/repositories/engage/addresses";
import { resolveAudience } from "@/repositories/engage/audience";
import {
  bulkInsertRecipients,
  claimQueuedBatch,
  countQueued,
  setRecipientSent,
  setRecipientFailed,
} from "@/repositories/engage/recipients";
import { listConstituentsByIds } from "@/repositories/constituents";
import { bulkLogInteractions } from "@/repositories/interactions";
import type { AudienceSpec } from "@/types/engage";

/**
 * Email send pipeline — production shape:
 *
 *  1. `sendEmailMessage` preflights (sender + CAN-SPAM postal address), CLAIMS
 *     the message with an atomic draft/scheduled→sending compare-and-set (a
 *     concurrent double-submit loses the CAS and becomes a no-op), fans out
 *     recipients idempotently, then drains.
 *  2. `drainEmailMessage` processes queued recipients in atomically-claimed
 *     batches until none remain or the time budget runs out. Each batch claim
 *     is at-most-once (see claimQueuedBatch), so a crashed or timed-out drain
 *     is safely resumable — by the "Resume" admin action or the cron sweeper —
 *     with no risk of double emails.
 *  3. Provider calls retry with backoff on rate-limit/transient errors, so a
 *     429 no longer counts as a permanently failed recipient.
 *
 * The message leaves 'sending' only when the queue is empty: 'sent' if anyone
 * got it, 'failed' if nobody did.
 */

export interface DrainResult {
  sent: number;
  failed: number;
  remaining: number;
}

const BATCH_SIZE = 25;
const DEFAULT_DEADLINE_MS = 25_000;
const RETRYABLE = /rate.?limit|too many|429|timeout|timed out|econnreset|socket|5\d\d|internal|unavailable/i;

/** Call a provider send with small backoff retries on transient errors. */
async function sendWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1_000, 3_000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= delays.length || !RETRYABLE.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, delays[attempt]! + Math.random() * 500));
    }
  }
}

export async function sendEmailMessage(
  orgId: string,
  messageId: string,
  opts: { deadlineMs?: number } = {},
): Promise<DrainResult> {
  const message = await getMessage(orgId, messageId);
  if (!message) throw new Error("Message not found");
  if (message.channel !== "email") throw new Error("Not an email message");
  if (!message.body_md || !message.subject) throw new Error("Subject and body are required");

  const org = await getOrgById(orgId);
  if (!org) throw new Error("Org not found");

  // Preflight BEFORE claiming: a misconfigured org must not strand the message
  // in 'sending'. CAN-SPAM requires a postal address in every marketing email.
  const sender = message.sender_id ? await getSender(orgId, message.sender_id) : await getDefaultSender(orgId);
  if (!sender && !org.receipt_from_email) {
    throw new Error("Add a verified sender in Tidings → Settings → Senders before sending.");
  }
  const orgAddress = await getAddressByType(orgId, "organization");
  const hasPostal = Boolean(orgAddress) || Boolean((org.address_json as { line1?: string } | null)?.line1);
  if (!hasPostal) {
    throw new Error(
      "Add your organization's mailing address (Tidings → Settings → Addresses) — required on every email by CAN-SPAM.",
    );
  }

  if (message.status !== "draft" && message.status !== "scheduled" && message.status !== "sending") {
    throw new Error(`Cannot send a message in status '${message.status}'`);
  }

  // Fan out BEFORE claiming (idempotent per message+constituent): a concurrent
  // caller that loses the claim below falls through to draining, and drain
  // finalizes when the queue is empty — recipients must exist by then or a
  // racing drain could finalize an unfanned message as failed.
  if (message.status !== "sending") {
    const audience = (message.audience_json ?? { mode: "all" }) as AudienceSpec;
    const constituents = await resolveAudience(orgId, audience, "email");
    await bulkInsertRecipients(
      orgId,
      messageId,
      constituents.map((c) => ({ constituentId: c.id, toEmail: c.email })),
    );
    const claimed = await claimMessageForSending(orgId, messageId);
    if (!claimed) {
      // Lost the claim (double-submit). If the winner is mid-send, help drain;
      // otherwise report the state honestly.
      const current = await getMessage(orgId, messageId);
      if (current?.status === "sending") return drainEmailMessage(orgId, messageId, opts);
      throw new Error(`Cannot send a message in status '${current?.status ?? "unknown"}'`);
    }
    await setMessageStatus(orgId, messageId, "sending", { recipientCount: constituents.length });
  }

  return drainEmailMessage(orgId, messageId, opts);
}

/**
 * Drain queued recipients within a time budget. Safe to call repeatedly and
 * concurrently (batch claims are atomic); used by the send action, the admin
 * "Resume" button, and the cron sweeper.
 */
export async function drainEmailMessage(
  orgId: string,
  messageId: string,
  opts: { deadlineMs?: number } = {},
): Promise<DrainResult> {
  const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const message = await getMessage(orgId, messageId);
  if (!message || message.channel !== "email") throw new Error("Message not found");
  if (message.status !== "sending") return { sent: 0, failed: 0, remaining: 0 };
  if (!message.body_md || !message.subject) throw new Error("Subject and body are required");

  const org = await getOrgById(orgId);
  if (!org) throw new Error("Org not found");
  const sender = message.sender_id ? await getSender(orgId, message.sender_id) : await getDefaultSender(orgId);
  const mergeFields = await listMergeFields(orgId);
  const orgAddress = await getAddressByType(orgId, "organization");
  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");

  let sent = 0;
  let failed = 0;
  const sentConstituentIds: string[] = [];

  while (Date.now() < deadline) {
    const batch = await claimQueuedBatch(orgId, messageId, BATCH_SIZE);
    if (batch.length === 0) break;

    const ids = batch.map((r) => r.constituent_id).filter((x): x is string => Boolean(x));
    const byId = new Map((await listConstituentsByIds(orgId, ids)).map((c) => [c.id, c]));

    for (const r of batch) {
      const c = r.constituent_id ? byId.get(r.constituent_id) : undefined;
      if (!c || !r.to_email) {
        await setRecipientFailed(orgId, r.id, "Missing recipient/email");
        failed++;
        continue;
      }
      try {
        const unsubscribeUrl = `${base}/u/${makeUnsubscribeToken(orgId, c.id)}`;
        const html = buildEmailHtml({
          org,
          constituent: c,
          bodyMd: message.body_md,
          mergeFields,
          orgAddress,
          unsubscribeUrl,
        });
        const { id } = await sendWithRetry(() =>
          sendEngageEmail({
            fromName: sender?.from_name ?? org.legal_name,
            fromEmail: sender?.from_email ?? org.receipt_from_email,
            replyTo: sender?.reply_to ?? null,
            to: r.to_email!,
            subject: renderMergeTags(message.subject!, c, mergeFields),
            html,
            unsubscribeUrl,
          }),
        );
        await setRecipientSent(orgId, r.id, id);
        sent++;
        sentConstituentIds.push(c.id);
      } catch (e) {
        await setRecipientFailed(orgId, r.id, e instanceof Error ? e.message : "send error");
        failed++;
      }
    }
  }

  // Timeline logging is best-effort — a logging error must never fail a send.
  if (sentConstituentIds.length > 0) {
    await bulkLogInteractions(
      orgId,
      sentConstituentIds.map((cid) => ({ constituentId: cid, type: "email", subject: message.subject })),
    ).catch(() => {});
  }

  const remaining = await countQueued(orgId, messageId);
  if (remaining === 0) {
    const anySent = sent > 0 || (await anyRecipientDelivered(orgId, messageId));
    await setMessageStatus(orgId, messageId, anySent ? "sent" : "failed", { sentAt: new Date() });
  }
  return { sent, failed, remaining };
}

async function anyRecipientDelivered(orgId: string, messageId: string): Promise<boolean> {
  const { statsForMessage } = await import("@/repositories/engage/recipients");
  const stats = await statsForMessage(orgId, messageId);
  return stats.total - stats.failed - stats.bounced > 0;
}
