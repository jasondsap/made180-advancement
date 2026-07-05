import { getOrgById } from "@/repositories/orgs";
import { sendTransactionalEmail } from "@/lib/email";
import type { TributeType } from "@/types/db";

/**
 * Tribute notification ("eCard"): when a donor dedicates a gift and asks us to
 * notify someone, email that person after the gift succeeds. Amount is
 * deliberately omitted (etiquette); the donor's message is plain-text escaped.
 * Best-effort from the webhook — never fails the gift.
 */
export async function sendTributeNotice(opts: {
  orgId: string;
  toEmail: string;
  tributeType: TributeType;
  tributeName: string;
  donorName: string;
  message: string | null;
}): Promise<void> {
  const org = await getOrgById(opts.orgId);
  if (!org) return;

  const phrase = opts.tributeType === "in_memory" ? "in memory of" : "in honor of";
  const donor = opts.donorName.trim() || "A donor";
  const accent = org.primary_color || "#7A2E2E";

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2B2620;line-height:1.6">
    <div style="border-top:4px solid ${accent};padding-top:18px">
      <p>Dear friend,</p>
      <p><strong>${escapeHtml(donor)}</strong> has made a gift to
         <strong>${escapeHtml(org.legal_name)}</strong> ${phrase}
         <strong>${escapeHtml(opts.tributeName)}</strong>, and wanted you to know.</p>
      ${opts.message ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#f4f1ea;border-left:3px solid ${accent};font-style:italic">${escapeHtml(opts.message)}</blockquote>` : ""}
      <p>With warm regards,<br/>${escapeHtml(org.legal_name)}</p>
    </div>
  </div>`;

  await sendTransactionalEmail({
    fromName: org.legal_name,
    fromEmail: org.receipt_from_email,
    to: opts.toEmail,
    subject: `A gift has been made ${phrase} ${opts.tributeName}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
