import { createHmac, timingSafeEqual } from "crypto";
import { requireEnv } from "@/lib/env";

/**
 * Signed, stateless unsubscribe tokens. Payload is `orgId:constituentId`,
 * HMAC-signed with NEXTAUTH_SECRET so the public /u/[token] route can verify
 * intent without a DB lookup or login. Tampering fails the signature check.
 */
const b64url = (b: Buffer) => b.toString("base64url");

function sign(payload: string): string {
  return b64url(createHmac("sha256", requireEnv("NEXTAUTH_SECRET")).update(payload).digest());
}

export function makeUnsubscribeToken(orgId: string, constituentId: string): string {
  const payload = `${orgId}:${constituentId}`;
  return `${b64url(Buffer.from(payload))}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { orgId: string; constituentId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [orgId, constituentId] = payload.split(":");
  if (!orgId || !constituentId) return null;
  return { orgId, constituentId };
}
