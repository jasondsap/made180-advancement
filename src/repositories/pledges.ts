import { sql, getSql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

export interface Pledge {
  id: string;
  org_id: string;
  constituent_id: string;
  fund_id: string | null;
  campaign_id: string | null;
  total_cents: number;
  balance_cents: number;
  schedule: string | null;
  starts_on: string | null;
  status: string;
  created_at: Date;
}

export interface PledgeWithDonor extends Pledge {
  donor_name: string;
}

export async function listPledges(orgId: string): Promise<PledgeWithDonor[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT p.*,
           COALESCE(NULLIF(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email, 'Unknown') AS donor_name
    FROM pledges p JOIN constituents c ON c.id = p.constituent_id
    WHERE p.org_id = ${orgId}
    ORDER BY p.created_at DESC
  `) as unknown as PledgeWithDonor[];
}

export async function createPledge(
  orgId: string,
  p: { constituentId: string; fundId: string | null; campaignId: string | null; totalCents: number; schedule: string | null; startsOn: string | null },
): Promise<Pledge> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO pledges (org_id, constituent_id, fund_id, campaign_id, total_cents, balance_cents, schedule, starts_on, status)
    VALUES (${orgId}, ${p.constituentId}, ${p.fundId}, ${p.campaignId}, ${p.totalCents}, ${p.totalCents}, ${p.schedule}, ${p.startsOn}, 'open')
    RETURNING *
  `) as unknown as Pledge[];
  return rows[0]!;
}

export interface PledgeSummary {
  openCount: number;
  projectedCents: number; // total promised on open pledges
  receivedCents: number; // drawn down (total - balance) across all pledges
  outstandingCents: number; // remaining balance on open pledges
}

export async function pledgeSummary(orgId: string): Promise<PledgeSummary> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
      COALESCE(SUM(total_cents) FILTER (WHERE status = 'open'), 0)::bigint AS projected,
      COALESCE(SUM(total_cents - balance_cents), 0)::bigint AS received,
      COALESCE(SUM(balance_cents) FILTER (WHERE status = 'open'), 0)::bigint AS outstanding
    FROM pledges WHERE org_id = ${orgId}
  `) as unknown as Array<{ open_count: number; projected: string; received: string; outstanding: string }>;
  const r = rows[0];
  return {
    openCount: Number(r?.open_count ?? 0),
    projectedCents: Number(r?.projected ?? 0),
    receivedCents: Number(r?.received ?? 0),
    outstandingCents: Number(r?.outstanding ?? 0),
  };
}

/**
 * Apply a payment against a pledge: insert a 'pledge' gift linked to it and draw
 * down the balance, marking it fulfilled when fully paid. Atomic transaction.
 */
export async function applyPledgePayment(
  orgId: string,
  args: { pledgeId: string; constituentId: string; fundId: string | null; amountCents: number; receivedAt: Date },
): Promise<void> {
  assertOrgId(orgId);
  const s = getSql();
  await s.transaction([
    s`INSERT INTO gifts (org_id, constituent_id, fund_id, pledge_id, gift_type, amount_cents, currency, status, received_at)
      VALUES (${orgId}, ${args.constituentId}, ${args.fundId}, ${args.pledgeId}, 'pledge', ${args.amountCents}, 'usd', 'succeeded', ${args.receivedAt.toISOString()})`,
    s`UPDATE pledges SET balance_cents = GREATEST(0, balance_cents - ${args.amountCents}) WHERE org_id = ${orgId} AND id = ${args.pledgeId}`,
    s`UPDATE pledges SET status = 'fulfilled' WHERE org_id = ${orgId} AND id = ${args.pledgeId} AND balance_cents <= 0`,
  ]);
}
