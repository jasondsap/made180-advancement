import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { RecurringPlan } from "@/types/db";

/**
 * recurring_plans — our mirror of a Stripe subscription. Scoped by org_id.
 * Keyed for upsert on the globally-unique stripe_subscription_id.
 */
export interface UpsertRecurringPlanInput {
  constituentId: string | null;
  fundId: string | null;
  stripeSubscriptionId: string;
  amountCents: number;
  interval: string;
  status: string;
  startedAt: Date | null;
}

export async function upsertRecurringPlan(
  orgId: string,
  p: UpsertRecurringPlanInput,
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    INSERT INTO recurring_plans (
      org_id, constituent_id, fund_id, stripe_subscription_id,
      amount_cents, interval, status, started_at
    ) VALUES (
      ${orgId},
      ${p.constituentId},
      ${p.fundId},
      ${p.stripeSubscriptionId},
      ${p.amountCents},
      ${p.interval},
      ${p.status},
      ${p.startedAt ? p.startedAt.toISOString() : null}
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status         = EXCLUDED.status,
      amount_cents   = EXCLUDED.amount_cents,
      interval       = EXCLUDED.interval,
      fund_id        = COALESCE(EXCLUDED.fund_id, recurring_plans.fund_id),
      constituent_id = COALESCE(EXCLUDED.constituent_id, recurring_plans.constituent_id)
  `;
}

export async function setRecurringPlanStatus(
  orgId: string,
  stripeSubscriptionId: string,
  status: string,
  canceledAt: Date | null = null,
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE recurring_plans
    SET status = ${status},
        canceled_at = ${canceledAt ? canceledAt.toISOString() : null}
    WHERE org_id = ${orgId} AND stripe_subscription_id = ${stripeSubscriptionId}
  `;
}

export async function listRecurringPlansForConstituent(
  orgId: string,
  constituentId: string,
): Promise<RecurringPlan[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM recurring_plans
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId}
    ORDER BY created_at DESC
  `) as unknown as RecurringPlan[];
}

export async function getRecurringPlanBySubscriptionId(
  orgId: string,
  stripeSubscriptionId: string,
): Promise<RecurringPlan | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM recurring_plans
    WHERE org_id = ${orgId} AND stripe_subscription_id = ${stripeSubscriptionId}
    LIMIT 1
  `) as unknown as RecurringPlan[];
  return rows[0];
}
