import { describe, it, expect } from "vitest";
import { grossUpForFees, estimatedFeeCents, STRIPE_FEE_PERCENT, STRIPE_FEE_FIXED_CENTS } from "./fees";

describe("grossUpForFees", () => {
  it("nets the org the intended amount after Stripe's cut (within a cent)", () => {
    for (const intended of [100, 2500, 10000, 123456, 1_000_000]) {
      const charge = grossUpForFees(intended);
      const net = charge - (charge * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED_CENTS);
      // Rounding to whole cents can leave the org at most half a cent off.
      expect(Math.abs(net - intended)).toBeLessThan(1);
      expect(charge).toBeGreaterThan(intended);
    }
  });
});

describe("estimatedFeeCents", () => {
  it("matches percent + fixed", () => {
    expect(estimatedFeeCents(10000)).toBe(Math.round(10000 * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED_CENTS);
  });
});
