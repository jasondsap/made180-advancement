import type { Constituent, Org } from "@/types/db";
import type { EngageMergeField, EngageAddress } from "@/types/engage";

/** Escape HTML so user-authored body content can't inject markup. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const fullName = (c: Constituent) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.org_name || "Friend";

const fullAddress = (c: Constituent) => {
  const a = c.address_json ?? {};
  return [a.line1, a.line2, [a.city, a.state, a.zip].filter(Boolean).join(", ")].filter(Boolean).join(", ");
};

/**
 * Replace {{contact.*}} merge tags against a constituent, falling back to a
 * merge field's configured default (then ""). Built-in tags are resolved first;
 * unknown tags resolve to their default or empty so nothing leaks raw braces.
 */
export function renderMergeTags(template: string, c: Constituent, mergeFields: EngageMergeField[]): string {
  const builtin: Record<string, string> = {
    "{{contact.first_name}}": c.first_name ?? "",
    "{{contact.full_name}}": fullName(c),
    "{{contact.primary_email}}": c.email ?? "",
    "{{contact.primary_phone}}": c.phone ?? "",
    "{{contact.full_address}}": fullAddress(c),
  };
  const defaults = new Map(mergeFields.map((m) => [m.tag, m.default_value ?? ""]));
  return template.replace(/\{\{[^}]+\}\}/g, (tag) => builtin[tag] ?? defaults.get(tag) ?? "");
}

/** Minimal plaintext/markdown → safe HTML: escape, **bold**, newline → <br>. */
function bodyToHtml(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\r?\n/g, "<br>");
}

/** Format the CAN-SPAM postal line from an Engage address or the org address. */
function postalLine(org: Org, addr: EngageAddress | undefined): string {
  if (addr) return [addr.line1, addr.line2, `${addr.city}, ${addr.state} ${addr.postal_code}`].filter(Boolean).join(", ");
  const a = org.address_json ?? {};
  return [a.line1, a.line2, [a.city, a.state, a.zip].filter(Boolean).join(", ")].filter(Boolean).join(", ");
}

/**
 * Build the full HTML email for one recipient: branded header (org logo/color),
 * rendered body, and a CAN-SPAM footer with the org postal address + a working
 * unsubscribe link.
 */
export function buildEmailHtml(opts: {
  org: Org;
  constituent: Constituent;
  bodyMd: string;
  mergeFields: EngageMergeField[];
  orgAddress: EngageAddress | undefined;
  unsubscribeUrl: string;
}): string {
  const { org, constituent, bodyMd, mergeFields, orgAddress, unsubscribeUrl } = opts;
  const accent = org.primary_color && /^#[0-9a-f]{6}$/i.test(org.primary_color) ? org.primary_color : "#6E2A2A";
  const body = bodyToHtml(renderMergeTags(bodyMd, constituent, mergeFields));
  const header = org.logo_url
    ? `<img src="${esc(org.logo_url)}" alt="${esc(org.legal_name)}" style="max-height:48px;max-width:200px" />`
    : `<div style="font-size:20px;font-weight:600;color:${accent}">${esc(org.legal_name)}</div>`;

  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Georgia,serif;color:#2B2620">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="border-top:4px solid ${accent};background:#fff;border-radius:8px;overflow:hidden">
      <div style="padding:24px 28px;border-bottom:1px solid #eee">${header}</div>
      <div style="padding:24px 28px;font-size:16px;line-height:1.6">${body}</div>
      <div style="padding:18px 28px;border-top:1px solid #eee;font-size:12px;color:#888;font-family:Arial,sans-serif">
        <p style="margin:0 0 6px">${esc(org.legal_name)} · ${esc(postalLine(org, orgAddress))}</p>
        <p style="margin:0">You received this because you're in our donor records.
          <a href="${esc(unsubscribeUrl)}" style="color:#888">Unsubscribe</a>.</p>
      </div>
    </div>
  </div></body></html>`;
}
