/**
 * Processing-fee math for the "cover the fees" option.
 *
 * NVRE's negotiated nonprofit rate is 2.2% + $0.30 (spec §8). When a donor opts
 * to cover fees we gross up the charge so the org nets the intended gift after
 * Stripe's cut.
 *
 * Note: the donor's full charged amount is tax-deductible regardless (they
 * receive no goods or services), so the receipt reflects the grossed-up total.
 */
export const STRIPE_FEE_PERCENT = 0.022;
export const STRIPE_FEE_FIXED_CENTS = 30;

/** Gross up an intended gift so the org nets it after fees. Returns charge cents. */
export function grossUpForFees(intendedCents: number): number {
  return Math.round((intendedCents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_PERCENT));
}

/** Estimated Stripe fee on a given charge amount (cents). Display/estimate only. */
export function estimatedFeeCents(chargeCents: number): number {
  return Math.round(chargeCents * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED_CENTS;
}
