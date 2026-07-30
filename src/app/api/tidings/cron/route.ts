import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import {
  listDueScheduledMessages,
  listStuckSendingMessages,
  setMessageStatus,
} from "@/repositories/engage/messages";
import { sendEmailMessage, drainEmailMessage } from "@/domain/engage/send";
import { sendSmsMessage, drainSmsMessage } from "@/domain/engage/sendSms";

/**
 * Interactions sweeper — fires due SCHEDULED messages and resumes sends STUCK in
 * 'sending' (crashed / timed-out drain). Point any minute-level scheduler at
 * it (EventBridge Scheduler, cron-job.org, GitHub Actions cron):
 *
 *   POST /api/tidings/cron   with  Authorization: Bearer $CRON_SECRET
 *
 * Fail-closed: no CRON_SECRET configured → 503. Work is deadline-budgeted so
 * one tick never outruns the Lambda; whatever is left is picked up next tick.
 * Draining is safe under concurrency (atomic batch claims), so overlapping
 * ticks cannot double-send.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICK_BUDGET_MS = 50_000;
const PER_MESSAGE_MS = 20_000;

function authorized(req: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : (req.nextUrl.searchParams.get("secret") ?? "");
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!env().CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  const results: Array<{ id: string; kind: string; sent?: number; failed?: number; remaining?: number; error?: string }> = [];

  const budgetLeft = () => TICK_BUDGET_MS - (Date.now() - startedAt);
  const drain = (orgId: string, id: string, channel: string) => {
    const deadlineMs = Math.min(PER_MESSAGE_MS, budgetLeft());
    return channel === "sms"
      ? drainSmsMessage(orgId, id, { deadlineMs })
      : drainEmailMessage(orgId, id, { deadlineMs });
  };

  // 1. Fire due scheduled messages. sendEmailMessage/sendSmsMessage handle the
  // atomic claim internally, so overlapping ticks can't double-send.
  for (const m of await listDueScheduledMessages()) {
    if (budgetLeft() < 3_000) break;
    try {
      const deadlineMs = Math.min(PER_MESSAGE_MS, budgetLeft());
      const r =
        m.channel === "sms"
          ? await sendSmsMessage(m.org_id, m.id, { deadlineMs })
          : await sendEmailMessage(m.org_id, m.id, { deadlineMs });
      results.push({ id: m.id, kind: `scheduled:${m.channel}`, ...r });
    } catch (e) {
      // Don't silently retry a broken scheduled message forever — fail it so it
      // lands in the Drafts tab (status filter) where the admin can fix + resend.
      await setMessageStatus(m.org_id, m.id, "failed").catch(() => {});
      results.push({ id: m.id, kind: `scheduled:${m.channel}`, error: e instanceof Error ? e.message : "failed" });
    }
  }

  // 2. Resume stuck sends.
  for (const m of await listStuckSendingMessages()) {
    if (budgetLeft() < 3_000) break;
    try {
      const r = await drain(m.org_id, m.id, m.channel);
      results.push({ id: m.id, kind: `stuck:${m.channel}`, ...r });
    } catch (e) {
      results.push({ id: m.id, kind: `stuck:${m.channel}`, error: e instanceof Error ? e.message : "failed" });
    }
  }

  return NextResponse.json({ ok: true, tookMs: Date.now() - startedAt, results });
}

/** Some schedulers can only GET. Same auth, same work. */
export async function GET(req: NextRequest) {
  return POST(req);
}
