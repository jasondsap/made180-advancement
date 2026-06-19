// ============================================================
// Small additions to wire the receipt sender in.
// ============================================================

// ---------- add to lib/repos/orgs.ts ----------
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

export async function getOrgById(orgId: string) {
  const rows = await sql`
    select id, slug, legal_name, ein, stripe_account_id,
           receipt_from_email, receipt_signature_name, address_json
    from orgs where id = ${orgId} limit 1`;
  return rows[0] ?? null;
}

// ---------- add to lib/repos/funds.ts ----------
export async function getFundNameById(orgId: string, fundId: string | null): Promise<string | null> {
  if (!fundId) return null;
  const rows = await sql`
    select name from funds where org_id = ${orgId} and id = ${fundId} limit 1`;
  return rows[0]?.name ?? null;
}

// ============================================================
// In the webhook handlers (handleOneTime / handleRecurringInvoice),
// look up the fund name before sending so the receipt shows the
// designation, not a blank:
//
//   const fundName = await getFundNameById(orgId, m.fund_id || null);
//   await sendReceiptEmail({ orgId, gift, constituent, receiptNumber, fundName });
//
// (The sendReceiptEmail signature already accepts fundName.)
// ============================================================
