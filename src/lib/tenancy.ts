/**
 * The single tenancy guard.
 *
 * Rule (spec §0/§1): every repository function takes `orgId` as its first
 * argument and scopes every query by it. The org id is ALWAYS derived from a
 * trusted source — the Cognito session (admin app) or the resolved URL slug
 * (public donation page) — never from arbitrary client input on an
 * authenticated route.
 *
 * This module enforces the mechanical half of that rule: every repo call runs
 * `assertOrgId(orgId)` before touching the database, so a missing/undefined/
 * malformed org id fails loudly instead of silently returning or mutating
 * another tenant's data.
 */

export class TenancyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenancyError";
  }
}

// RFC-4122-ish: 8-4-4-4-12 hex, any version/variant. orgs.id is gen_random_uuid().
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate and return the org id. Throws TenancyError if it is missing or not a
 * UUID — which means a bug upstream (e.g. an unresolved session) rather than a
 * normal "not found", so it should surface as a 500, not leak across tenants.
 */
export function assertOrgId(orgId: unknown): string {
  if (typeof orgId !== "string" || !UUID_RE.test(orgId)) {
    throw new TenancyError(
      `Refusing to run a query without a valid orgId (got: ${JSON.stringify(orgId)}). ` +
        `Org id must come from the session or resolved slug.`,
    );
  }
  return orgId;
}

/**
 * Defense in depth: assert a row actually belongs to the expected org before
 * returning it. Use on single-row lookups where a query bug could otherwise
 * return cross-tenant data. Returns the row (typed) or throws.
 */
export function assertBelongsToOrg<T extends { org_id: string }>(
  row: T | undefined,
  orgId: string,
): T | undefined {
  if (row && row.org_id !== orgId) {
    throw new TenancyError(
      `Tenancy violation: row org_id=${row.org_id} does not match expected ${orgId}.`,
    );
  }
  return row;
}

/** Normalize an email for storage + dedupe (matches the lower(email) index). */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
