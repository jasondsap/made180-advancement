import { env } from "@/lib/env";
import { getOrgById } from "@/repositories/orgs";
import { getConstituentById } from "@/repositories/constituents";
import { makeManageBillingToken } from "@/lib/engageTokens";
import { sendTransactionalEmail } from "@/lib/email";

/**
 * Donor recurring-gift notices: the signed "manage my gift" link and the
 * failed-payment dunning email. The manage link points at /manage/[token],
 * which opens a Stripe Billing Portal session so the donor can update their
 * card, change, or cancel — no login required.
 */

export function manageBillingUrl(orgId: string, constituentId: string): string {
  const base = (env().APP_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}/manage/${makeManageBillingToken(orgId, constituentId)}`;
}

/**
 * Email a donor whose recurring charge just failed, with a link to update their
 * payment method. Best-effort; callers swallow errors so the webhook never 500s.
 */
export async function sendRecurringDunning(orgId: string, constituentId: string): Promise<void> {
  const [org, con] = await Promise.all([
    getOrgById(orgId),
    getConstituentById(orgId, constituentId),
  ]);
  if (!org || !con?.email) return;

  const name = [con.first_name, con.last_name].filter(Boolean).join(" ") || "Friend";
  const url = manageBillingUrl(orgId, constituentId);
  const html = `
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.55">
    <p>Dear ${escapeHtml(name)},</p>
    <p>We tried to process your recurring gift to <strong>${escapeHtml(org.legal_name)}</strong>,
       but your payment didn't go through — usually an expired or declined card.</p>
    <p>You can update your payment details in a moment here:</p>
    <p style="margin:24px 0">
      <a href="${url}" style="background:${org.primary_color || "#7A2E2E"};color:#fff;
         padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
        Update my payment method
      </a>
    </p>
    <p>Your support means a great deal to us. Thank you for standing with us.</p>
    <p style="margin-top:28px">With gratitude,<br/>${escapeHtml(org.legal_name)}</p>
  </div>`;

  await sendTransactionalEmail({
    fromName: org.legal_name,
    fromEmail: org.receipt_from_email,
    to: con.email,
    subject: `Action needed: your recurring gift to ${org.legal_name}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
