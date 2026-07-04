import { sql } from "@/lib/db";
import { assertOrgId, normalizeEmail } from "@/lib/tenancy";

/**
 * Bulk CSV import (constituents + historical gifts). Everything here is
 * batch-shaped: one unnest statement per batch, never a per-row round-trip
 * (the audit's bulkInsertRecipients N+1 lesson, applied from day one).
 *
 * Idempotency contract:
 *  - Constituent rows WITH an email upsert on (org_id, lower(email)) —
 *    re-importing enriches, never duplicates. Consent flags only ever OR to
 *    true (an import can't un-opt-out someone).
 *  - Constituent rows WITHOUT an email are plain inserts — re-importing
 *    duplicates them (surfaced in the wizard UI as a warning).
 *  - Gift rows with an external_ref are unique on (org_id, external_ref) —
 *    re-import is a no-op. Rows without one insert every time (warned in UI).
 */

export interface ImportConstituentRow {
  type: "individual" | "organization";
  firstName: string | null;
  lastName: string | null;
  orgName: string | null;
  email: string | null;
  phone: string | null;
  address: { line1?: string; line2?: string; city?: string; state?: string; zip?: string } | null;
  doNotContact: boolean;
  emailOptOut: boolean;
  smsOptIn: boolean;
}

export interface BulkUpsertResult {
  created: number;
  updated: number;
}

/**
 * Upsert a batch of constituents with emails. The caller must have deduped the
 * batch by email (ON CONFLICT DO UPDATE can't touch the same row twice in one
 * statement).
 */
export async function bulkUpsertConstituentsByEmail(
  orgId: string,
  rows: ImportConstituentRow[],
): Promise<BulkUpsertResult> {
  assertOrgId(orgId);
  if (rows.length === 0) return { created: 0, updated: 0 };
  const types = rows.map((r) => r.type);
  const firsts = rows.map((r) => r.firstName);
  const lasts = rows.map((r) => r.lastName);
  const orgNames = rows.map((r) => r.orgName);
  const emails = rows.map((r) => normalizeEmail(r.email));
  const phones = rows.map((r) => r.phone);
  const addresses = rows.map((r) => (r.address ? JSON.stringify(r.address) : null));
  const dncs = rows.map((r) => r.doNotContact);
  const optOuts = rows.map((r) => r.emailOptOut);
  const smsIns = rows.map((r) => r.smsOptIn);

  const result = (await sql`
    INSERT INTO constituents
      (org_id, type, first_name, last_name, org_name, email, phone, address_json,
       do_not_contact, email_opt_out, sms_opt_in, source)
    SELECT ${orgId}, u.type, u.first_name, u.last_name, u.org_name, u.email, u.phone,
           u.address::jsonb, u.dnc, u.opt_out, u.sms_in, 'import'
    FROM unnest(
      ${types}::text[], ${firsts}::text[], ${lasts}::text[], ${orgNames}::text[],
      ${emails}::text[], ${phones}::text[], ${addresses}::text[],
      ${dncs}::boolean[], ${optOuts}::boolean[], ${smsIns}::boolean[]
    ) AS u(type, first_name, last_name, org_name, email, phone, address, dnc, opt_out, sms_in)
    ON CONFLICT (org_id, lower(email)) WHERE email IS NOT NULL
    DO UPDATE SET
      first_name     = COALESCE(constituents.first_name, EXCLUDED.first_name),
      last_name      = COALESCE(constituents.last_name, EXCLUDED.last_name),
      org_name       = COALESCE(constituents.org_name, EXCLUDED.org_name),
      phone          = COALESCE(constituents.phone, EXCLUDED.phone),
      address_json   = COALESCE(constituents.address_json, EXCLUDED.address_json),
      do_not_contact = constituents.do_not_contact OR EXCLUDED.do_not_contact,
      email_opt_out  = constituents.email_opt_out OR EXCLUDED.email_opt_out,
      sms_opt_in     = constituents.sms_opt_in OR EXCLUDED.sms_opt_in
    RETURNING (xmax = 0) AS created
  `) as unknown as Array<{ created: boolean }>;

  const created = result.filter((r) => r.created).length;
  return { created, updated: result.length - created };
}

/** Plain insert for no-email rows (no dedupe key exists). */
export async function bulkInsertConstituentsNoEmail(
  orgId: string,
  rows: ImportConstituentRow[],
): Promise<number> {
  assertOrgId(orgId);
  if (rows.length === 0) return 0;
  const types = rows.map((r) => r.type);
  const firsts = rows.map((r) => r.firstName);
  const lasts = rows.map((r) => r.lastName);
  const orgNames = rows.map((r) => r.orgName);
  const phones = rows.map((r) => r.phone);
  const addresses = rows.map((r) => (r.address ? JSON.stringify(r.address) : null));
  const dncs = rows.map((r) => r.doNotContact);

  const result = (await sql`
    INSERT INTO constituents
      (org_id, type, first_name, last_name, org_name, phone, address_json, do_not_contact, source)
    SELECT ${orgId}, u.type, u.first_name, u.last_name, u.org_name, u.phone, u.address::jsonb, u.dnc, 'import'
    FROM unnest(
      ${types}::text[], ${firsts}::text[], ${lasts}::text[], ${orgNames}::text[],
      ${phones}::text[], ${addresses}::text[], ${dncs}::boolean[]
    ) AS u(type, first_name, last_name, org_name, phone, address, dnc)
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return result.length;
}

/** Map lower(email) → constituent id for a batch of emails (donor resolution). */
export async function mapConstituentIdsByEmail(
  orgId: string,
  emails: string[],
): Promise<Map<string, string>> {
  assertOrgId(orgId);
  const map = new Map<string, string>();
  if (emails.length === 0) return map;
  const rows = (await sql`
    SELECT id, lower(email) AS email FROM constituents
    WHERE org_id = ${orgId} AND lower(email) = ANY(${emails}::text[])
  `) as unknown as Array<{ id: string; email: string }>;
  for (const r of rows) map.set(r.email, r.id);
  return map;
}

/** Which of these external refs already exist (already-imported gifts)? */
export async function listExistingExternalRefs(
  orgId: string,
  refs: string[],
): Promise<Set<string>> {
  assertOrgId(orgId);
  const set = new Set<string>();
  if (refs.length === 0) return set;
  const rows = (await sql`
    SELECT external_ref FROM gifts
    WHERE org_id = ${orgId} AND external_ref = ANY(${refs}::text[])
  `) as unknown as Array<{ external_ref: string }>;
  for (const r of rows) set.add(r.external_ref);
  return set;
}

export interface ImportGiftRow {
  constituentId: string;
  fundId: string | null;
  campaignId: string | null;
  giftType: string;
  amountCents: number;
  receivedAtIso: string; // YYYY-MM-DD, validated upstream
  externalRef: string | null;
  notes: string | null;
  isAnonymous: boolean;
}

/**
 * Insert a batch of historical gifts, all status='succeeded'. ON CONFLICT on
 * (org_id, external_ref) makes re-imports of ref-carrying rows no-ops. The
 * caller must dedupe external refs within the batch.
 */
export async function bulkInsertImportedGifts(
  orgId: string,
  rows: ImportGiftRow[],
): Promise<number> {
  assertOrgId(orgId);
  if (rows.length === 0) return 0;
  const conIds = rows.map((r) => r.constituentId);
  const fundIds = rows.map((r) => r.fundId);
  const campaignIds = rows.map((r) => r.campaignId);
  const types = rows.map((r) => r.giftType);
  const amounts = rows.map((r) => r.amountCents);
  const dates = rows.map((r) => r.receivedAtIso);
  const refs = rows.map((r) => r.externalRef);
  const notes = rows.map((r) => r.notes);
  const anons = rows.map((r) => r.isAnonymous);

  const result = (await sql`
    INSERT INTO gifts
      (org_id, constituent_id, fund_id, campaign_id, gift_type, amount_cents,
       currency, status, received_at, external_ref, notes, is_anonymous)
    SELECT ${orgId}, u.con_id, u.fund_id, u.campaign_id, u.gift_type, u.amount,
           'usd', 'succeeded', u.received::date, u.ref, u.notes, u.anon
    FROM unnest(
      ${conIds}::uuid[], ${fundIds}::uuid[], ${campaignIds}::uuid[], ${types}::text[],
      ${amounts}::int[], ${dates}::text[], ${refs}::text[], ${notes}::text[], ${anons}::boolean[]
    ) AS u(con_id, fund_id, campaign_id, gift_type, amount, received, ref, notes, anon)
    ON CONFLICT (org_id, external_ref) WHERE external_ref IS NOT NULL
    DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return result.length;
}
