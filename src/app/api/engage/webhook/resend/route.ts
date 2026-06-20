import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { advanceStatusByProviderId, getByProviderId } from "@/repositories/engage/recipients";
import { setEmailOptOut } from "@/repositories/constituents";
import type { RecipientStatus } from "@/types/engage";

/**
 * Resend delivery webhook. Advances per-recipient status (delivered/opened/
 * clicked/bounced) keyed on the Resend email id we stored as provider_message_id.
 * Complaints suppress the constituent (email_opt_out). Signed with Svix headers;
 * verified manually so we don't add the svix dependency.
 */
export const dynamic = "force-dynamic";

const TYPE_TO_STATUS: Record<string, RecipientStatus> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "unsubscribed",
};

function verifySvix(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  // Header may contain multiple space-separated "v1,<sig>" entries.
  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1] ?? part;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (secret && !verifySvix(secret, req.headers, raw)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const status = event.type ? TYPE_TO_STATUS[event.type] : undefined;
  const providerId = event.data?.email_id;
  if (!status || !providerId) return NextResponse.json({ ok: true, ignored: true });

  await advanceStatusByProviderId(providerId, status);

  // A spam complaint must suppress future marketing email to that contact.
  if (status === "unsubscribed") {
    const r = await getByProviderId(providerId);
    if (r?.constituent_id) await setEmailOptOut(r.org_id, r.constituent_id, true);
  }

  return NextResponse.json({ ok: true });
}
