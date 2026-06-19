import { Resend } from "resend";
import { env, requireEnv } from "@/lib/env";

/**
 * Resend transactional email (server-only). Lazy client so importing this never
 * touches env at build time; requireEnv throws a clear error only when we
 * actually try to send.
 *
 * Deliverability note: `from` must be a Resend-verified sender/domain. NVRE's
 * orgs.receipt_from_email should be verified in production; until then the
 * RESEND_FROM_FALLBACK (or Resend's onboarding@resend.dev, which can only send
 * to your own account email) is used.
 */
let cached: Resend | null = null;

function client(): Resend {
  if (!cached) cached = new Resend(requireEnv("RESEND_API_KEY"));
  return cached;
}

export interface ReceiptEmail {
  fromName: string;
  fromEmail: string | null;
  to: string;
  subject: string;
  html: string;
  pdf: Buffer;
  pdfFilename: string;
}

export async function sendReceiptEmail(msg: ReceiptEmail): Promise<{ id: string | null }> {
  const from = msg.fromEmail || env().RESEND_FROM_FALLBACK || "onboarding@resend.dev";
  const result = await client().emails.send({
    from: `${msg.fromName} <${from}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    attachments: [{ filename: msg.pdfFilename, content: msg.pdf.toString("base64") }],
  });
  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
  return { id: result.data?.id ?? null };
}
