import { env } from "@/lib/env";
import { getOrgById } from "@/repositories/orgs";

/**
 * Feature flags — two layers:
 *  1. Env flags (this file's `flags()`): what the PLATFORM has provisioned
 *     (Twilio creds, Canva app, …). Build-safe literal reads in env.ts; a flag
 *     is on when its var is exactly "1" or "true". Off by default.
 *  2. Per-org entitlements (orgs.features, migration 0019): what a given
 *     tenant may use. Missing key / null = entitled, so effective =
 *     env AND (features[key] !== false). `orgFlags()` combines both — use it
 *     everywhere a tenant-facing surface is gated; plain `flags()` only for
 *     platform-level checks with no org in scope.
 */
const on = (v: string | undefined) => v === "1" || v === "true";

export type FeatureKey =
  | "engageSms"
  | "engageMailings"
  | "fundraiserEvents"
  | "fundraiserP2p"
  | "fundraiserAuction"
  | "canva";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  engageSms: "Tidings SMS",
  engageMailings: "Tidings mailings",
  fundraiserEvents: "Events (ticketing)",
  fundraiserP2p: "Peer-to-peer",
  fundraiserAuction: "Auctions",
  canva: "Canva integration",
};

export function flags(): Record<FeatureKey, boolean> {
  const e = env();
  return {
    engageSms: on(e.ENGAGE_SMS_ENABLED),
    engageMailings: on(e.ENGAGE_MAILINGS_ENABLED),
    fundraiserEvents: on(e.FUNDRAISER_EVENTS_ENABLED),
    fundraiserP2p: on(e.FUNDRAISER_P2P_ENABLED),
    fundraiserAuction: on(e.FUNDRAISER_AUCTION_ENABLED),
    canva: on(e.CANVA_ENABLED),
  };
}

/** Effective flags for a tenant: platform provisioning AND org entitlement. */
export async function orgFlags(orgId: string): Promise<Record<FeatureKey, boolean>> {
  const base = flags();
  const org = await getOrgById(orgId);
  const overrides = org?.features ?? null;
  if (!overrides) return base;
  const out = { ...base };
  for (const key of Object.keys(base) as FeatureKey[]) {
    if (overrides[key] === false) out[key] = false;
  }
  return out;
}
