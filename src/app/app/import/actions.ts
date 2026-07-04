"use server";

import { z } from "zod";
import { getAuthContext, canManage } from "@/lib/auth";
import { listFunds } from "@/repositories/funds";
import { listCampaigns } from "@/repositories/campaigns";
import {
  bulkUpsertConstituentsByEmail,
  bulkInsertConstituentsNoEmail,
  mapConstituentIdsByEmail,
  listExistingExternalRefs,
  bulkInsertImportedGifts,
  type ImportConstituentRow,
} from "@/repositories/imports";
import { normalizeEmail } from "@/lib/tenancy";

/**
 * Import wizard server actions. The client parses + maps the CSV and calls
 * these in batches (≤500 rows), so a big file never risks one long Lambda
 * request. Everything is canManage-gated and org-scoped from the session.
 */

const BATCH_MAX = 500;

async function requireManager() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  return ctx;
}

// ---------------------------------------------------------------------------
// Constituents
// ---------------------------------------------------------------------------

const ConstituentRowSchema = z.object({
  type: z.enum(["individual", "organization"]).default("individual"),
  firstName: z.string().trim().max(120).nullish(),
  lastName: z.string().trim().max(120).nullish(),
  orgName: z.string().trim().max(200).nullish(),
  email: z.string().trim().max(320).nullish(),
  phone: z.string().trim().max(40).nullish(),
  line1: z.string().trim().max(200).nullish(),
  line2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  state: z.string().trim().max(120).nullish(),
  zip: z.string().trim().max(20).nullish(),
  doNotContact: z.boolean().default(false),
  emailOptOut: z.boolean().default(false),
  smsOptIn: z.boolean().default(false),
});

export interface ConstituentImportResult {
  created: number;
  updated: number;
  createdNoEmail: number;
  skipped: number; // empty rows (no name, no org, no email)
}

export async function importConstituentsBatchAction(
  input: unknown,
): Promise<ConstituentImportResult> {
  const ctx = await requireManager();
  const rows = z.array(ConstituentRowSchema).max(BATCH_MAX).parse(input);

  const mapped: ImportConstituentRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    const email = normalizeEmail(r.email ?? null);
    const hasIdentity = email || r.firstName || r.lastName || r.orgName;
    if (!hasIdentity) {
      skipped++;
      continue;
    }
    const address =
      r.line1 || r.city || r.state || r.zip
        ? {
            line1: r.line1 || undefined,
            line2: r.line2 || undefined,
            city: r.city || undefined,
            state: r.state || undefined,
            zip: r.zip || undefined,
          }
        : null;
    mapped.push({
      type: r.type,
      firstName: r.firstName || null,
      lastName: r.lastName || null,
      orgName: r.orgName || null,
      email,
      phone: r.phone || null,
      address,
      doNotContact: r.doNotContact,
      emailOptOut: r.emailOptOut,
      smsOptIn: r.smsOptIn,
    });
  }

  // Split emailed vs no-email; dedupe emails within the batch (ON CONFLICT
  // can't update the same row twice in one statement — last occurrence wins).
  const byEmail = new Map<string, ImportConstituentRow>();
  const noEmail: ImportConstituentRow[] = [];
  for (const r of mapped) {
    if (r.email) byEmail.set(r.email, r);
    else noEmail.push(r);
  }

  const upsert = await bulkUpsertConstituentsByEmail(ctx.orgId, [...byEmail.values()]);
  const createdNoEmail = await bulkInsertConstituentsNoEmail(ctx.orgId, noEmail);
  skipped += mapped.length - byEmail.size - noEmail.length; // in-batch email dupes

  return { created: upsert.created, updated: upsert.updated, createdNoEmail, skipped };
}

/** Pre-import stats: how many of these emails already exist in the org. */
export async function previewConstituentsAction(input: unknown): Promise<{ existing: number }> {
  const ctx = await requireManager();
  const emails = z.array(z.string().trim().max(320)).max(20_000).parse(input);
  const normalized = [...new Set(emails.map((e) => normalizeEmail(e)).filter((e): e is string => !!e))];
  // Batch the ANY() lookup to keep a single statement reasonable.
  let existing = 0;
  for (let i = 0; i < normalized.length; i += 5_000) {
    const map = await mapConstituentIdsByEmail(ctx.orgId, normalized.slice(i, i + 5_000));
    existing += map.size;
  }
  return { existing };
}

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------

const GIFT_TYPES = new Set([
  "one_time", "recurring", "check", "cash", "in_kind", "stock", "matching", "pledge",
]);

const GiftRowSchema = z.object({
  rowNum: z.number().int(), // original CSV line, for error reporting
  donorEmail: z.string().trim().max(320),
  donorFirst: z.string().trim().max(120).nullish(),
  donorLast: z.string().trim().max(120).nullish(),
  amountCents: z.number().int().min(1).max(100_000_000),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fundKey: z.string().trim().max(200).nullish(), // code or name
  campaignName: z.string().trim().max(200).nullish(),
  giftType: z.string().trim().max(40).nullish(),
  externalRef: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  isAnonymous: z.boolean().default(false),
});

export interface GiftImportResult {
  created: number;
  skippedDup: number; // external_ref already imported
  unmatchedFund: number; // imported with fund = null
  unmatchedCampaign: number;
  errors: Array<{ rowNum: number; error: string }>;
}

export async function importGiftsBatchAction(input: unknown): Promise<GiftImportResult> {
  const ctx = await requireManager();
  const rows = z.array(GiftRowSchema).max(BATCH_MAX).parse(input);

  const errors: Array<{ rowNum: number; error: string }> = [];
  const valid = rows.filter((r) => {
    const email = normalizeEmail(r.donorEmail);
    if (!email) {
      errors.push({ rowNum: r.rowNum, error: "Missing or invalid donor email" });
      return false;
    }
    return true;
  });

  // Resolve donors: existing by email, then bulk-create the missing ones.
  const emails = [...new Set(valid.map((r) => normalizeEmail(r.donorEmail)!))];
  const idByEmail = await mapConstituentIdsByEmail(ctx.orgId, emails);
  const missing = emails.filter((e) => !idByEmail.has(e));
  if (missing.length > 0) {
    const stub = new Map<string, ImportConstituentRow>();
    for (const r of valid) {
      const e = normalizeEmail(r.donorEmail)!;
      if (!idByEmail.has(e) && !stub.has(e)) {
        stub.set(e, {
          type: "individual",
          firstName: r.donorFirst || null,
          lastName: r.donorLast || null,
          orgName: null,
          email: e,
          phone: null,
          address: null,
          doNotContact: false,
          emailOptOut: false,
          smsOptIn: false,
        });
      }
    }
    await bulkUpsertConstituentsByEmail(ctx.orgId, [...stub.values()]);
    const createdMap = await mapConstituentIdsByEmail(ctx.orgId, missing);
    for (const [e, id] of createdMap) idByEmail.set(e, id);
  }

  // Resolve funds (by code or name) and campaigns (by name), case-insensitive.
  const [funds, campaigns] = await Promise.all([listFunds(ctx.orgId), listCampaigns(ctx.orgId)]);
  const fundByKey = new Map<string, string>();
  for (const f of funds) {
    fundByKey.set(f.code.toLowerCase(), f.id);
    fundByKey.set(f.name.toLowerCase(), f.id);
  }
  const campaignByName = new Map(campaigns.map((c) => [c.name.toLowerCase(), c.id]));

  // Skip refs that were already imported; dedupe refs within the batch.
  const refs = [...new Set(valid.map((r) => r.externalRef).filter((x): x is string => !!x))];
  const existingRefs = await listExistingExternalRefs(ctx.orgId, refs);
  const seenRefs = new Set<string>();

  let skippedDup = 0;
  let unmatchedFund = 0;
  let unmatchedCampaign = 0;
  const toInsert = [];
  for (const r of valid) {
    if (r.externalRef) {
      if (existingRefs.has(r.externalRef) || seenRefs.has(r.externalRef)) {
        skippedDup++;
        continue;
      }
      seenRefs.add(r.externalRef);
    }
    const constituentId = idByEmail.get(normalizeEmail(r.donorEmail)!);
    if (!constituentId) {
      errors.push({ rowNum: r.rowNum, error: "Could not resolve donor" });
      continue;
    }
    let fundId: string | null = null;
    if (r.fundKey) {
      fundId = fundByKey.get(r.fundKey.toLowerCase()) ?? null;
      if (!fundId) unmatchedFund++;
    }
    let campaignId: string | null = null;
    if (r.campaignName) {
      campaignId = campaignByName.get(r.campaignName.toLowerCase()) ?? null;
      if (!campaignId) unmatchedCampaign++;
    }
    const type = (r.giftType ?? "").toLowerCase().replace(/[\s-]+/g, "_");
    toInsert.push({
      constituentId,
      fundId,
      campaignId,
      giftType: GIFT_TYPES.has(type) ? type : "one_time",
      amountCents: r.amountCents,
      receivedAtIso: r.dateIso,
      externalRef: r.externalRef || null,
      notes: r.notes || null,
      isAnonymous: r.isAnonymous,
    });
  }

  const created = await bulkInsertImportedGifts(ctx.orgId, toInsert);
  // ON CONFLICT DO NOTHING can still drop a ref-race row; count it as a dup.
  skippedDup += toInsert.length - created;

  return { created, skippedDup, unmatchedFund, unmatchedCampaign, errors };
}

/** Pre-import stats for gifts: donor match + already-imported ref counts. */
export async function previewGiftsAction(input: unknown): Promise<{
  knownDonors: number;
  unknownDonors: number;
  alreadyImported: number;
}> {
  const ctx = await requireManager();
  const parsed = z
    .object({
      emails: z.array(z.string().trim().max(320)).max(20_000),
      refs: z.array(z.string().trim().max(200)).max(20_000),
    })
    .parse(input);

  const emails = [...new Set(parsed.emails.map((e) => normalizeEmail(e)).filter((e): e is string => !!e))];
  let known = 0;
  for (let i = 0; i < emails.length; i += 5_000) {
    const map = await mapConstituentIdsByEmail(ctx.orgId, emails.slice(i, i + 5_000));
    known += map.size;
  }
  const refs = [...new Set(parsed.refs.filter(Boolean))];
  let alreadyImported = 0;
  for (let i = 0; i < refs.length; i += 5_000) {
    const set = await listExistingExternalRefs(ctx.orgId, refs.slice(i, i + 5_000));
    alreadyImported += set.size;
  }
  return { knownDonors: known, unknownDonors: emails.length - known, alreadyImported };
}
