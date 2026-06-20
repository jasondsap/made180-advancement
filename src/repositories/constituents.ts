import { sql, getSql } from "@/lib/db";
import { assertOrgId, normalizeEmail } from "@/lib/tenancy";
import type { Constituent, UpsertConstituentInput, ConstituentType, AddressJson } from "@/types/db";

/**
 * Constituent repository — the dedupe spine.
 *
 * Matching is on (org_id, lower(email)) via the partial unique index
 * `constituents_org_email_uniq`. We NEVER create a second constituent for the
 * same email within an org (spec §3.2).
 */

export async function getConstituentById(
  orgId: string,
  id: string,
): Promise<Constituent | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM constituents
    WHERE org_id = ${orgId} AND id = ${id}
    LIMIT 1
  `) as unknown as Constituent[];
  return rows[0];
}

export async function findConstituentByEmail(
  orgId: string,
  email: string,
): Promise<Constituent | undefined> {
  assertOrgId(orgId);
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  const rows = (await sql`
    SELECT * FROM constituents
    WHERE org_id = ${orgId} AND lower(email) = ${normalized}
    LIMIT 1
  `) as unknown as Constituent[];
  return rows[0];
}

/**
 * Upsert by email — returns the matched-or-created constituent plus whether it
 * was newly created. This is the function the webhook calls before inserting a
 * gift.
 *
 * On match we ENRICH rather than overwrite: existing non-null fields win, so a
 * web form can't blank out or clobber data already on file. `created` uses the
 * Postgres `xmax = 0` trick (true for the INSERT path, false for the conflict
 * UPDATE path).
 */
export async function upsertConstituentByEmail(
  orgId: string,
  input: UpsertConstituentInput,
): Promise<{ constituent: Constituent; created: boolean }> {
  assertOrgId(orgId);
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("upsertConstituentByEmail requires a non-empty email");
  }
  const address = input.address ? JSON.stringify(input.address) : null;

  const rows = (await sql`
    INSERT INTO constituents
      (org_id, type, first_name, last_name, org_name, email, phone, address_json, source)
    VALUES (
      ${orgId},
      ${input.type ?? "individual"},
      ${input.firstName ?? null},
      ${input.lastName ?? null},
      ${input.orgName ?? null},
      ${email},
      ${input.phone ?? null},
      ${address}::jsonb,
      ${input.source ?? "web_donation"}
    )
    ON CONFLICT (org_id, lower(email)) WHERE email IS NOT NULL
    DO UPDATE SET
      first_name   = COALESCE(constituents.first_name, EXCLUDED.first_name),
      last_name    = COALESCE(constituents.last_name, EXCLUDED.last_name),
      org_name     = COALESCE(constituents.org_name, EXCLUDED.org_name),
      phone        = COALESCE(constituents.phone, EXCLUDED.phone),
      address_json = COALESCE(constituents.address_json, EXCLUDED.address_json)
    RETURNING *, (xmax = 0) AS created
  `) as unknown as Array<Constituent & { created: boolean }>;

  const row = rows[0];
  if (!row) {
    // Should be unreachable: INSERT ... ON CONFLICT DO UPDATE always returns a row.
    throw new Error("upsertConstituentByEmail returned no row");
  }
  const { created, ...constituent } = row;
  return { constituent, created };
}

/**
 * Create a constituent directly (manual admin entry). Use when there's no email
 * to dedupe on (e.g. a check from someone not on file); when an email exists,
 * prefer upsertConstituentByEmail to avoid duplicates.
 */
export async function createConstituent(
  orgId: string,
  input: Omit<UpsertConstituentInput, "email"> & { email?: string | null },
): Promise<Constituent> {
  assertOrgId(orgId);
  const email = normalizeEmail(input.email ?? null);
  const address = input.address ? JSON.stringify(input.address) : null;
  const rows = (await sql`
    INSERT INTO constituents
      (org_id, type, first_name, last_name, org_name, email, phone, address_json, source)
    VALUES (
      ${orgId}, ${input.type ?? "individual"}, ${input.firstName ?? null},
      ${input.lastName ?? null}, ${input.orgName ?? null}, ${email},
      ${input.phone ?? null}, ${address}::jsonb, ${input.source ?? "manual"}
    )
    RETURNING *
  `) as unknown as Constituent[];
  const row = rows[0];
  if (!row) throw new Error("createConstituent returned no row");
  return row;
}

export interface UpdateConstituentInput {
  type?: ConstituentType;
  firstName?: string | null;
  lastName?: string | null;
  orgName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: AddressJson | null;
  doNotContact?: boolean;
  emailOptOut?: boolean;
  smsOptIn?: boolean;
}

export async function updateConstituent(
  orgId: string,
  id: string,
  input: UpdateConstituentInput,
): Promise<Constituent> {
  assertOrgId(orgId);
  const email = input.email !== undefined ? normalizeEmail(input.email) : undefined;
  const address = input.address !== undefined ? (input.address ? JSON.stringify(input.address) : null) : undefined;
  const rows = (await sql`
    UPDATE constituents SET
      type           = COALESCE(${input.type ?? null}, type),
      first_name     = ${input.firstName ?? null},
      last_name      = ${input.lastName ?? null},
      org_name       = ${input.orgName ?? null},
      email          = ${email ?? null},
      phone          = ${input.phone ?? null},
      address_json   = COALESCE(${address ?? null}::jsonb, address_json),
      do_not_contact = COALESCE(${input.doNotContact ?? null}, do_not_contact),
      email_opt_out  = COALESCE(${input.emailOptOut ?? null}, email_opt_out),
      sms_opt_in     = COALESCE(${input.smsOptIn ?? null}, sms_opt_in)
    WHERE org_id = ${orgId} AND id = ${id}
    RETURNING *
  `) as unknown as Constituent[];
  const row = rows[0];
  if (!row) throw new Error("updateConstituent: not found");
  return row;
}

/**
 * Suppress SMS for every constituent with this phone, across orgs. Used by the
 * Twilio inbound STOP handler, which carries no org context — like the
 * provider-id webhook paths, the globally-unique phone is the key (documented
 * exception to orgId-first).
 */
export async function setSmsOptInByPhone(phone: string, optIn: boolean): Promise<void> {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return;
  await sql`UPDATE constituents SET sms_opt_in = ${optIn} WHERE regexp_replace(coalesce(phone,''), '[^0-9+]', '', 'g') = ${digits}`;
}

/**
 * Merge `sourceId` into `targetId`: reassign all of source's gifts, pledges,
 * recurring plans, attributes, soft-credits, and relationships to target, then
 * delete source. Runs in a single HTTP transaction so it's all-or-nothing.
 */
export async function mergeConstituents(
  orgId: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  assertOrgId(orgId);
  if (sourceId === targetId) throw new Error("Cannot merge a constituent into itself");
  const s = getSql();
  await s.transaction([
    s`UPDATE gifts SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE gifts SET soft_credit_id = ${targetId} WHERE org_id = ${orgId} AND soft_credit_id = ${sourceId}`,
    s`UPDATE pledges SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE recurring_plans SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE constituent_attributes SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE constituent_relationships SET from_id = ${targetId} WHERE org_id = ${orgId} AND from_id = ${sourceId}`,
    s`UPDATE constituent_relationships SET to_id = ${targetId} WHERE org_id = ${orgId} AND to_id = ${sourceId}`,
    // drop any self-relationships created by the merge
    s`DELETE FROM constituent_relationships WHERE org_id = ${orgId} AND from_id = to_id`,
    s`DELETE FROM constituents WHERE org_id = ${orgId} AND id = ${sourceId}`,
  ]);
}

/** Fetch constituents by id set (for merged mailings). Org-scoped. */
export async function listConstituentsByIds(orgId: string, ids: string[]): Promise<Constituent[]> {
  assertOrgId(orgId);
  if (ids.length === 0) return [];
  return (await sql`
    SELECT * FROM constituents WHERE org_id = ${orgId} AND id = ANY(${ids}::uuid[])
  `) as unknown as Constituent[];
}

/** Set the email marketing opt-out flag (used by the public unsubscribe route). */
export async function setEmailOptOut(orgId: string, id: string, optOut: boolean): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE constituents SET email_opt_out = ${optOut} WHERE org_id = ${orgId} AND id = ${id}`;
}

export async function listConstituents(
  orgId: string,
  opts: { limit?: number; offset?: number; search?: string } = {},
): Promise<Constituent[]> {
  assertOrgId(orgId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const search = opts.search?.trim();

  if (search) {
    const like = `%${search.toLowerCase()}%`;
    return (await sql`
      SELECT * FROM constituents
      WHERE org_id = ${orgId}
        AND (
          lower(email) LIKE ${like}
          OR lower(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) LIKE ${like}
          OR lower(coalesce(org_name, '')) LIKE ${like}
        )
      ORDER BY updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as Constituent[];
  }

  return (await sql`
    SELECT * FROM constituents
    WHERE org_id = ${orgId}
    ORDER BY updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as Constituent[];
}
