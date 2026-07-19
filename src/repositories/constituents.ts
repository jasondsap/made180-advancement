import { sql, getSql } from "@/lib/db";
import { assertOrgId, normalizeEmail, isUuid } from "@/lib/tenancy";
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
  if (!isUuid(id)) return undefined;
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
  input: Omit<UpsertConstituentInput, "email"> & { email?: string | null; employer?: string | null },
): Promise<Constituent> {
  assertOrgId(orgId);
  const email = normalizeEmail(input.email ?? null);
  const address = input.address ? JSON.stringify(input.address) : null;
  const rows = (await sql`
    INSERT INTO constituents
      (org_id, type, first_name, last_name, org_name, email, phone, address_json, employer, source)
    VALUES (
      ${orgId}, ${input.type ?? "individual"}, ${input.firstName ?? null},
      ${input.lastName ?? null}, ${input.orgName ?? null}, ${email},
      ${input.phone ?? null}, ${address}::jsonb, ${input.employer ?? null}, ${input.source ?? "manual"}
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
  employer?: string | null;
  doNotContact?: boolean;
  emailOptOut?: boolean;
  smsOptIn?: boolean;
}

/**
 * Full-record update from the edit form (the only caller passes every field).
 * `address: null` genuinely CLEARS the address — the old COALESCE pattern made
 * a blanked address silently keep the previous one.
 */
export async function updateConstituent(
  orgId: string,
  id: string,
  input: UpdateConstituentInput,
): Promise<Constituent> {
  assertOrgId(orgId);
  const email = input.email !== undefined ? normalizeEmail(input.email) : undefined;
  const address = input.address ? JSON.stringify(input.address) : null;
  const clearAddress = input.address !== undefined; // explicit null clears
  const rows = (await sql`
    UPDATE constituents SET
      type           = COALESCE(${input.type ?? null}, type),
      first_name     = ${input.firstName ?? null},
      last_name      = ${input.lastName ?? null},
      org_name       = ${input.orgName ?? null},
      email          = ${email ?? null},
      phone          = ${input.phone ?? null},
      employer       = ${input.employer ?? null},
      address_json   = CASE WHEN ${clearAddress} THEN ${address}::jsonb ELSE address_json END,
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

/** Enrich-only employer capture (matching gifts) from the checkout webhook. */
export async function setConstituentEmployer(orgId: string, id: string, employer: string): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE constituents SET employer = ${employer.slice(0, 200)}
    WHERE org_id = ${orgId} AND id = ${id} AND employer IS NULL
  `;
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
 * Merge `sourceId` into `targetId`: reassign ALL of source's records — gifts,
 * soft-credits, pledges, recurring plans, attributes, relationships, plus the
 * activity spine (interactions, tasks) and channel history (engage_recipients,
 * registrants, p2p_members, auction_bids) — to target, then delete source.
 * Runs in a single HTTP transaction so it's all-or-nothing.
 *
 * Every table that references constituents MUST be reassigned here; anything
 * missed is silently destroyed (interactions/tasks) or orphaned (SET NULL) when
 * the source row is deleted. Keep this list in sync with new FKs to constituents.
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
    // Activity spine: NOT NULL + ON DELETE CASCADE, so these are destroyed if not moved.
    s`UPDATE interactions SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE tasks SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    // engage_recipients has a partial unique index on (message_id, constituent_id):
    // drop source rows that would collide with an existing target row, then move the rest.
    s`DELETE FROM engage_recipients er
        WHERE er.org_id = ${orgId} AND er.constituent_id = ${sourceId}
          AND EXISTS (
            SELECT 1 FROM engage_recipients t
            WHERE t.message_id = er.message_id AND t.constituent_id = ${targetId}
          )`,
    s`UPDATE engage_recipients SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE registrants SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE p2p_members SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
    s`UPDATE auction_bids SET constituent_id = ${targetId} WHERE org_id = ${orgId} AND constituent_id = ${sourceId}`,
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

/**
 * Record the donor's Stripe customer id (first one wins) so later checkouts
 * reuse it and the donor's whole history/subscriptions live under one customer,
 * enabling the billing portal. No-op if already set. Called from the webhook.
 */
export async function setConstituentStripeCustomer(
  orgId: string,
  id: string,
  customerId: string,
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE constituents SET stripe_customer_id = ${customerId}
    WHERE org_id = ${orgId} AND id = ${id} AND stripe_customer_id IS NULL
  `;
}

export async function listConstituents(
  orgId: string,
  opts: { limit?: number; offset?: number; search?: string; role?: string } = {},
): Promise<Constituent[]> {
  assertOrgId(orgId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const search = opts.search?.trim() || null;
  const like = search ? `%${search.toLowerCase()}%` : null;
  const role = opts.role?.trim().toLowerCase() || null;

  // Both filters are optional and independent; a NULL param disables its clause.
  return (await sql`
    SELECT c.* FROM constituents c
    WHERE c.org_id = ${orgId}
      AND (${like}::text IS NULL OR
        lower(c.email) LIKE ${like}
        OR lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) LIKE ${like}
        OR lower(coalesce(c.org_name, '')) LIKE ${like})
      AND (${role}::text IS NULL OR EXISTS (
        SELECT 1 FROM constituent_attributes ca
        WHERE ca.org_id = c.org_id AND ca.constituent_id = c.id
          AND ca.attr_key = 'role' AND ca.attr_value = ${role}))
    ORDER BY c.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as Constituent[];
}
