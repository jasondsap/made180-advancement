import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

/**
 * Platform Stripe client (server-only). The platform account holds the keys;
 * each org is an Express connected account whose id lives on orgs.stripe_account_id.
 * Charges are created on the platform with destination = the connected account.
 *
 * apiVersion is pinned for reproducibility; the cast keeps it stable even as the
 * SDK's bundled type literal advances.
 */
const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-02-24.acacia";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!cached) {
    cached = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      appInfo: { name: "MADe180 Advancement Platform" },
    });
  }
  return cached;
}
