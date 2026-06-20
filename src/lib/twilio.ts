import { createHmac, timingSafeEqual } from "crypto";
import { env, requireEnv } from "@/lib/env";

/**
 * Twilio SMS via the REST API over fetch (no SDK dependency). Auth is HTTP Basic
 * with AccountSid:AuthToken. Prefer a Messaging Service (handles number pools +
 * Advanced Opt-Out/STOP) and fall back to a single From number.
 */
export async function sendSms(opts: {
  to: string;
  body: string;
  statusCallback?: string;
}): Promise<{ sid: string }> {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = env().TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = env().TWILIO_FROM_NUMBER;
  if (!messagingServiceSid && !fromNumber) {
    throw new Error("Twilio is not configured: set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER");
  }

  const form = new URLSearchParams();
  form.set("To", opts.to);
  form.set("Body", opts.body);
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", fromNumber!);
  if (opts.statusCallback) form.set("StatusCallback", opts.statusCallback);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = (await res.json()) as { sid?: string; message?: string; code?: number };
  if (!res.ok || !data.sid) {
    throw new Error(`Twilio send failed: ${data.message ?? res.statusText} (code ${data.code ?? res.status})`);
  }
  return { sid: data.sid };
}

/**
 * Validate Twilio's X-Twilio-Signature: HMAC-SHA1 (base64) of the full request
 * URL followed by each POST param name+value sorted by name, keyed by the auth
 * token. Returns false if Twilio isn't configured.
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const authToken = env().TWILIO_AUTH_TOKEN;
  if (!authToken || !signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
