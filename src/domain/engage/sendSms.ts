import { requireEnv } from "@/lib/env";
import { sendSms } from "@/lib/twilio";
import { renderMergeTags } from "@/domain/engage/render";
import {
  getMessage,
  setMessageStatus,
  claimMessageForSending,
} from "@/repositories/engage/messages";
import { listMergeFields } from "@/repositories/engage/mergeFields";
import { resolveAudience } from "@/repositories/engage/audience";
import {
  bulkInsertRecipients,
  claimQueuedBatch,
  countQueued,
  setRecipientSent,
  setRecipientFailed,
  statsForMessage,
} from "@/repositories/engage/recipients";
import { listConstituentsByIds } from "@/repositories/constituents";
import { bulkLogInteractions } from "@/repositories/interactions";
import type { AudienceSpec } from "@/types/engage";

/** Footer appended to every message (TCPA opt-out reminder). */
const STOP_FOOTER = "\nReply STOP to opt out.";

const BATCH_SIZE = 25;
const DEFAULT_DEADLINE_MS = 25_000;
const RETRYABLE = /rate.?limit|too many|429|timeout|timed out|econnreset|socket|5\d\d|internal|unavailable/i;

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

/**
 * SMS send — same production shape as email (see send.ts): atomic message
 * claim, idempotent fan-out, at-most-once batch claims, deadline-bounded drain
 * resumable by the admin action or the cron sweeper, retries on transient
 * Twilio errors. Audience is consent-filtered (sms_opt_in) upstream.
 */
export async function sendSmsMessage(
  orgId: string,
  messageId: string,
  opts: { deadlineMs?: number } = {},
): Promise<{ sent: number; failed: number; remaining: number }> {
  const message = await getMessage(orgId, messageId);
  if (!message) throw new Error("Message not found");
  if (message.channel !== "sms") throw new Error("Not an SMS message");
  if (!message.body_md) throw new Error("Message body is required");

  if (message.status !== "draft" && message.status !== "scheduled" && message.status !== "sending") {
    throw new Error(`Cannot send a message in status '${message.status}'`);
  }

  // Fan out BEFORE claiming — same ordering rationale as send.ts.
  if (message.status !== "sending") {
    const audience = (message.audience_json ?? { mode: "all" }) as AudienceSpec;
    const constituents = await resolveAudience(orgId, audience, "sms");
    await bulkInsertRecipients(orgId, messageId, constituents.map((c) => ({ constituentId: c.id, toPhone: c.phone })));
    const claimed = await claimMessageForSending(orgId, messageId);
    if (!claimed) {
      const current = await getMessage(orgId, messageId);
      if (current?.status === "sending") return drainSmsMessage(orgId, messageId, opts);
      throw new Error(`Cannot send a message in status '${current?.status ?? "unknown"}'`);
    }
    await setMessageStatus(orgId, messageId, "sending", { recipientCount: constituents.length });
  }

  return drainSmsMessage(orgId, messageId, opts);
}

export async function drainSmsMessage(
  orgId: string,
  messageId: string,
  opts: { deadlineMs?: number } = {},
): Promise<{ sent: number; failed: number; remaining: number }> {
  const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const message = await getMessage(orgId, messageId);
  if (!message || message.channel !== "sms") throw new Error("Message not found");
  if (message.status !== "sending") return { sent: 0, failed: 0, remaining: 0 };
  if (!message.body_md) throw new Error("Message body is required");

  const mergeFields = await listMergeFields(orgId);
  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const statusCallback = `${base}/api/tidings/webhook/twilio`;

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
      if (!c || !r.to_phone) {
        await setRecipientFailed(orgId, r.id, "Missing recipient/phone");
        failed++;
        continue;
      }
      try {
        const body = renderMergeTags(message.body_md, c, mergeFields) + STOP_FOOTER;
        const { sid } = await sendWithRetry(() => sendSms({ to: r.to_phone!, body, statusCallback }));
        await setRecipientSent(orgId, r.id, sid);
        sent++;
        sentConstituentIds.push(c.id);
      } catch (e) {
        await setRecipientFailed(orgId, r.id, e instanceof Error ? e.message : "send error");
        failed++;
      }
    }
  }

  if (sentConstituentIds.length > 0) {
    await bulkLogInteractions(
      orgId,
      sentConstituentIds.map((cid) => ({ constituentId: cid, type: "text", subject: message.name })),
    ).catch(() => {});
  }

  const remaining = await countQueued(orgId, messageId);
  if (remaining === 0) {
    const stats = await statsForMessage(orgId, messageId);
    const anySent = stats.total - stats.failed - stats.bounced > 0;
    await setMessageStatus(orgId, messageId, anySent ? "sent" : "failed", { sentAt: new Date() });
  }
  return { sent, failed, remaining };
}
