import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

/**
 * Donor-lapse reports — the fundraising staples.
 *  - LYBUNT: gave Last Year, But Unfortunately Not This (year).
 *  - SYBUNT: gave Some prior Year, But Unfortunately Not This (year).
 * Both over succeeded gifts, scoped to org.
 */
export interface LapsedDonor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  email: string | null;
  prior_cents: number; // last-year (LYBUNT) or all-prior (SYBUNT)
  lifetime_cents: number;
  last_gift_at: Date | null;
}

function yearBounds(year: number) {
  return {
    thisStart: `${year}-01-01`,
    nextStart: `${year + 1}-01-01`,
    lastStart: `${year - 1}-01-01`,
  };
}

const map = (rows: Array<Record<string, unknown>>): LapsedDonor[] =>
  rows.map((r) => ({
    id: String(r.id),
    first_name: (r.first_name as string) ?? null,
    last_name: (r.last_name as string) ?? null,
    org_name: (r.org_name as string) ?? null,
    email: (r.email as string) ?? null,
    prior_cents: Number(r.prior_cents ?? 0),
    lifetime_cents: Number(r.lifetime_cents ?? 0),
    last_gift_at: (r.last_gift_at as Date) ?? null,
  }));

export async function lybunt(orgId: string, year: number): Promise<LapsedDonor[]> {
  assertOrgId(orgId);
  const { thisStart, nextStart, lastStart } = yearBounds(year);
  const rows = (await sql`
    WITH gy AS (
      SELECT constituent_id,
             SUM(amount_cents) FILTER (WHERE received_at >= ${lastStart}::date AND received_at < ${thisStart}::date) AS last_year,
             SUM(amount_cents) FILTER (WHERE received_at >= ${thisStart}::date AND received_at < ${nextStart}::date) AS this_year,
             SUM(amount_cents) AS lifetime,
             MAX(received_at) AS last_gift_at
      FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded'
      GROUP BY constituent_id
    )
    SELECT c.id, c.first_name, c.last_name, c.org_name, c.email,
           gy.last_year AS prior_cents, gy.lifetime AS lifetime_cents, gy.last_gift_at
    FROM gy JOIN constituents c ON c.id = gy.constituent_id
    WHERE COALESCE(gy.last_year, 0) > 0 AND COALESCE(gy.this_year, 0) = 0
    ORDER BY gy.last_year DESC
  `) as unknown as Array<Record<string, unknown>>;
  return map(rows);
}

export async function sybunt(orgId: string, year: number): Promise<LapsedDonor[]> {
  assertOrgId(orgId);
  const { thisStart, nextStart } = yearBounds(year);
  const rows = (await sql`
    WITH gy AS (
      SELECT constituent_id,
             SUM(amount_cents) FILTER (WHERE received_at < ${thisStart}::date) AS prior,
             SUM(amount_cents) FILTER (WHERE received_at >= ${thisStart}::date AND received_at < ${nextStart}::date) AS this_year,
             SUM(amount_cents) AS lifetime,
             MAX(received_at) AS last_gift_at
      FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded'
      GROUP BY constituent_id
    )
    SELECT c.id, c.first_name, c.last_name, c.org_name, c.email,
           gy.prior AS prior_cents, gy.lifetime AS lifetime_cents, gy.last_gift_at
    FROM gy JOIN constituents c ON c.id = gy.constituent_id
    WHERE COALESCE(gy.prior, 0) > 0 AND COALESCE(gy.this_year, 0) = 0
    ORDER BY gy.prior DESC
  `) as unknown as Array<Record<string, unknown>>;
  return map(rows);
}
