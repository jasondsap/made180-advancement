import { env } from "@/lib/env";

/**
 * Feature flags, read from env (build-safe literal reads in env.ts). A flag is
 * on when its var is exactly "1" or "true". Off-by-default keeps un-provisioned
 * channels (SMS, mailings) and unfinished fundraiser types behind upsell /
 * "coming soon" UI rather than half-working surfaces.
 */
const on = (v: string | undefined) => v === "1" || v === "true";

export function flags() {
  const e = env();
  return {
    engageSms: on(e.ENGAGE_SMS_ENABLED),
    engageMailings: on(e.ENGAGE_MAILINGS_ENABLED),
    fundraiserEvents: on(e.FUNDRAISER_EVENTS_ENABLED),
    fundraiserP2p: on(e.FUNDRAISER_P2P_ENABLED),
    fundraiserAuction: on(e.FUNDRAISER_AUCTION_ENABLED),
  };
}
