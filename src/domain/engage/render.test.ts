import { describe, it, expect } from "vitest";
import { renderMergeTags, buildEmailHtml } from "./render";
import type { Constituent, Org } from "@/types/db";
import type { EngageMergeField } from "@/types/engage";

const constituent = {
  id: "c1",
  org_id: "o1",
  type: "individual",
  first_name: "Jane",
  last_name: "Smith",
  org_name: null,
  email: "jane@example.org",
  phone: "+15551234567",
  address_json: { line1: "1 Main St", city: "Philippi", state: "WV", zip: "26416" },
  do_not_contact: false,
  email_opt_out: false,
  sms_opt_in: true,
  stripe_customer_id: null,
  source: null,
  created_at: new Date(),
  updated_at: new Date(),
} as Constituent;

const org = {
  id: "o1",
  slug: "nvre",
  legal_name: "New Vision Renewable Energy",
  ein: "45-4696610",
  receipt_from_email: null,
  receipt_signature_name: null,
  stripe_account_id: null,
  address_json: { line1: "PO Box 1", city: "Philippi", state: "WV", zip: "26416" },
  logo_url: null,
  primary_color: "#336633",
  features: null,
  created_at: new Date(),
} as Org;

const fields: EngageMergeField[] = [
  { id: "m1", org_id: "o1", name: "Signoff", tag: "{{org.signoff}}", default_value: "With gratitude", created_at: new Date() } as EngageMergeField,
];

describe("renderMergeTags", () => {
  it("resolves built-ins and custom defaults", () => {
    const out = renderMergeTags("Hi {{contact.first_name}} — {{org.signoff}}", constituent, fields);
    expect(out).toBe("Hi Jane — With gratitude");
  });

  it("unknown tags render empty, never raw braces", () => {
    const out = renderMergeTags("X {{contact.nonsense}} Y", constituent, fields);
    expect(out).toBe("X  Y");
    expect(out).not.toContain("{{");
  });

  it("falls back to org name then 'Friend' for full_name", () => {
    const bare = { ...constituent, first_name: null, last_name: null, org_name: null } as Constituent;
    expect(renderMergeTags("{{contact.full_name}}", bare, [])).toBe("Friend");
  });
});

describe("buildEmailHtml", () => {
  const build = (bodyMd: string) =>
    buildEmailHtml({
      org,
      constituent,
      bodyMd,
      mergeFields: fields,
      orgAddress: undefined,
      unsubscribeUrl: "https://x.test/u/tok",
    });

  it("escapes user HTML in the body (no injection)", () => {
    const html = build(`<script>alert(1)</script> & "quotes"`);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("blocks javascript: links but allows https links and images", () => {
    const html = build(`[bad](javascript:alert(1)) [ok](https://example.org) ![pic](https://img.test/a.png)`);
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('<a href="https://example.org">ok</a>');
    expect(html).toContain('<img src="https://img.test/a.png"');
  });

  it("includes the CAN-SPAM postal line and unsubscribe link", () => {
    const html = build("Hello");
    expect(html).toContain("PO Box 1");
    expect(html).toContain('href="https://x.test/u/tok"');
    expect(html).toContain("Unsubscribe");
  });

  it("renders merge tags inside the body", () => {
    expect(build("Dear {{contact.first_name}},")).toContain("Dear Jane,");
  });
});
