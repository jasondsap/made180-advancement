import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Fundraiser, FundraiserType, FundraiserStatus, FundraiserFeature, FundraiserTheme } from "@/types/db";

/**
 * Fundraisers repository. A fundraiser is a publishable giving page that
 * designates gifts to a fund (+ optional campaign). raised/supporter totals are
 * derived from gifts.fundraiser_id, never stored counters. All queries org-scoped
 * except getBySlugPublic, which is the public-page resolver (org comes from slug,
 * like the orgs resolver — a documented exception).
 */

export interface FundraiserWithStats extends Fundraiser {
  raised_cents: number;
  supporter_count: number;
}

export async function listFundraisers(
  orgId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<FundraiserWithStats[]> {
  assertOrgId(orgId);
  if (opts.includeArchived) {
    return (await sql`
      SELECT f.*,
             COALESCE(g.raised_cents, 0)::int AS raised_cents,
             COALESCE(g.supporter_count, 0)::int AS supporter_count
      FROM fundraisers f
      LEFT JOIN (
        SELECT fundraiser_id, SUM(amount_cents) AS raised_cents, COUNT(DISTINCT constituent_id) AS supporter_count
        FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded' AND fundraiser_id IS NOT NULL
        GROUP BY fundraiser_id
      ) g ON g.fundraiser_id = f.id
      WHERE f.org_id = ${orgId}
      ORDER BY f.pinned DESC, f.created_at DESC
    `) as unknown as FundraiserWithStats[];
  }
  return (await sql`
    SELECT f.*,
           COALESCE(g.raised_cents, 0)::int AS raised_cents,
           COALESCE(g.supporter_count, 0)::int AS supporter_count
    FROM fundraisers f
    LEFT JOIN (
      SELECT fundraiser_id, SUM(amount_cents) AS raised_cents, COUNT(DISTINCT constituent_id) AS supporter_count
      FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded' AND fundraiser_id IS NOT NULL
      GROUP BY fundraiser_id
    ) g ON g.fundraiser_id = f.id
    WHERE f.org_id = ${orgId} AND f.status <> 'archived'
    ORDER BY f.pinned DESC, f.created_at DESC
  `) as unknown as FundraiserWithStats[];
}

export async function getFundraiser(orgId: string, id: string): Promise<FundraiserWithStats | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT f.*,
           COALESCE(g.raised_cents, 0)::int AS raised_cents,
           COALESCE(g.supporter_count, 0)::int AS supporter_count
    FROM fundraisers f
    LEFT JOIN (
      SELECT fundraiser_id, SUM(amount_cents) AS raised_cents, COUNT(DISTINCT constituent_id) AS supporter_count
      FROM gifts WHERE org_id = ${orgId} AND status = 'succeeded'
      GROUP BY fundraiser_id
    ) g ON g.fundraiser_id = f.id
    WHERE f.org_id = ${orgId} AND f.id = ${id} LIMIT 1
  `) as unknown as FundraiserWithStats[];
  return rows[0];
}

/** Public-page resolver: by org slug + fundraiser slug, published only. */
export async function getPublishedFundraiser(orgSlug: string, fundraiserSlug: string): Promise<Fundraiser | undefined> {
  const rows = (await sql`
    SELECT f.* FROM fundraisers f
    JOIN orgs o ON o.id = f.org_id
    WHERE lower(o.slug) = ${orgSlug.trim().toLowerCase()}
      AND lower(f.slug) = ${fundraiserSlug.trim().toLowerCase()}
      AND f.status = 'published'
    LIMIT 1
  `) as unknown as Fundraiser[];
  return rows[0];
}

export async function createFundraiser(
  orgId: string,
  f: { type: FundraiserType; title: string; slug: string; features?: FundraiserFeature[] },
): Promise<Fundraiser> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO fundraisers (org_id, type, title, slug, features)
    VALUES (${orgId}, ${f.type}, ${f.title.trim()}, ${f.slug.trim().toLowerCase()}, ${f.features ?? []})
    RETURNING *
  `) as unknown as Fundraiser[];
  return rows[0]!;
}

export async function updateFundraiser(
  orgId: string,
  id: string,
  f: {
    title: string;
    goalCents: number | null;
    fundId: string | null;
    campaignId: string | null;
    theme: FundraiserTheme | null;
  },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE fundraisers SET
      title = ${f.title.trim()},
      goal_cents = ${f.goalCents},
      fund_id = ${f.fundId},
      campaign_id = ${f.campaignId},
      theme_json = ${f.theme ? JSON.stringify(f.theme) : null}::jsonb
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function setFundraiserStatus(orgId: string, id: string, status: FundraiserStatus): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE fundraisers
    SET status = ${status}, published_at = CASE WHEN ${status} = 'published' AND published_at IS NULL THEN now() ELSE published_at END
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function setFundraiserPinned(orgId: string, id: string, pinned: boolean): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE fundraisers SET pinned = ${pinned} WHERE org_id = ${orgId} AND id = ${id}`;
}

export async function setFundraiserPayments(orgId: string, id: string, enabled: boolean): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE fundraisers SET payments_enabled = ${enabled} WHERE org_id = ${orgId} AND id = ${id}`;
}

/** Duplicate a fundraiser as a fresh unpublished draft (new slug). */
export async function duplicateFundraiser(orgId: string, id: string): Promise<Fundraiser | undefined> {
  assertOrgId(orgId);
  const src = await getFundraiser(orgId, id);
  if (!src) return undefined;
  const newSlug = `${src.slug}-copy-${Math.floor(Date.now() / 1000) % 100000}`;
  const rows = (await sql`
    INSERT INTO fundraisers (org_id, type, title, slug, goal_cents, currency, fund_id, campaign_id, features, theme_json)
    VALUES (${orgId}, ${src.type}, ${src.title + " (copy)"}, ${newSlug}, ${src.goal_cents}, ${src.currency},
            ${src.fund_id}, ${src.campaign_id}, ${src.features}, ${src.theme_json ? JSON.stringify(src.theme_json) : null}::jsonb)
    RETURNING *
  `) as unknown as Fundraiser[];
  return rows[0];
}

export async function slugExists(orgId: string, slug: string): Promise<boolean> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT 1 FROM fundraisers WHERE org_id = ${orgId} AND lower(slug) = ${slug.toLowerCase()} LIMIT 1`) as unknown as unknown[];
  return rows.length > 0;
}
