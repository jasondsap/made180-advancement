import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validateTwilioSignature } from "@/lib/twilio";
import { advanceStatusByProviderId } from "@/repositories/engage/recipients";
import type { RecipientStatus } from "@/types/engage";

/**
 * Twilio message status callback. Advances per-recipient delivery status keyed
 * on the Twilio MessageSid we stored as provider_message_id. Signed requests are
 * verified with X-Twilio-Signature against the configured callback URL.
 */
export const dynamic = "force-dynamic";

const STATUS: Record<string, RecipientStatus> = {
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
};

export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  const base = (env().APP_BASE_URL ?? "").replace(/\/$/, "");
  const url = `${base}/api/engage/webhook/twilio`;
  if (env().TWILIO_AUTH_TOKEN && !validateTwilioSignature(url, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const sid = params.MessageSid || params.SmsSid;
  const status = STATUS[params.MessageStatus ?? params.SmsStatus ?? ""];
  if (sid && status) {
    await advanceStatusByProviderId(sid, status, params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null);
  }
  // Twilio expects 200 with (optionally empty) TwiML.
  return new NextResponse("<Response></Response>", { headers: { "content-type": "text/xml" } });
}
