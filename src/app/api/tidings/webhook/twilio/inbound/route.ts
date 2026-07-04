import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validateTwilioSignature } from "@/lib/twilio";
import { setSmsOptInByPhone } from "@/repositories/constituents";

/**
 * Twilio inbound SMS handler — TCPA opt-out/opt-in keywords. STOP-family words
 * suppress the sender's number; START/UNSTOP re-subscribe. Suppression is by
 * phone across orgs (the inbound message carries no org context). Twilio's
 * Advanced Opt-Out also auto-replies; we mirror the state into our records.
 */
export const dynamic = "force-dynamic";

const STOP = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START = new Set(["start", "yes", "unstop"]);

export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  const base = (env().APP_BASE_URL ?? "").replace(/\/$/, "");
  const url = `${base}/api/tidings/webhook/twilio/inbound`;
  const token = env().TWILIO_AUTH_TOKEN;
  if (!token) {
    // Fail closed in production: a forged inbound "START"/"STOP" could flip
    // sms_opt_in for any phone across all orgs. Only skip verification in dev.
    if (process.env.NODE_ENV === "production") {
      console.error("[twilio inbound] TWILIO_AUTH_TOKEN not set — rejecting");
      return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
    }
    console.warn("[twilio inbound] no auth token — skipping signature check (non-production)");
  } else if (!validateTwilioSignature(url, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const from = params.From ?? "";
  const keyword = (params.Body ?? "").trim().toLowerCase();
  if (from) {
    if (STOP.has(keyword)) await setSmsOptInByPhone(from, false);
    else if (START.has(keyword)) await setSmsOptInByPhone(from, true);
  }

  return new NextResponse("<Response></Response>", { headers: { "content-type": "text/xml" } });
}
