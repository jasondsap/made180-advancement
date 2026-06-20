/**
 * POST /api/stripe/webhook  —  auto-log donations.
 *
 * Guarantees:
 *  - Raw body + signature verified against STRIPE_WEBHOOK_SECRET.
 *  - Idempotent: the same stripe_event_id is never processed twice (ledger),
 *    AND the same payment can't create two gifts (gift unique on PI).
 *  - Constituents dedupe on (org_id, lower(email)).
 *
 * Connect note: with destination charges the PaymentIntent / Checkout Session
 * live on the PLATFORM account, so these events arrive on the platform endpoint
 * and verify with STRIPE_WEBHOOK_SECRET. A separate Connect endpoint
 * (STRIPE_CONNECT_WEBHOOK_SECRET) is for connected-account-native events, added
 * later if needed.
 *
 * Scope (step 5): one-time donations only — checkout.session.completed and
 * payment_intent.succeeded. Recurring (invoice.paid, subscription events) is
 * step 7. Receipt generation/email is step 6 (seam marked below).
 */
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { requireEnv } from "@/lib/env";
import {
  claimWebhookEvent,
  setWebhookEventOrg,
  markWebhookProcessed,
  markWebhookError,
} from "@/repositories/webhookEvents";
import { upsertConstituentByEmail } from "@/repositories/constituents";
import { insertGift, markRefundedByPaymentIntent } from "@/repositories/gifts";
import { upsertRecurringPlan, setRecurringPlanStatus } from "@/repositories/recurringPlans";
import { issueReceipt } from "@/domain/receipts";
import type { AddressJson, TributeType } from "@/types/db";

/** Loose view of fields whose typing varies across Stripe API versions. */
type InvoiceLoose = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig) throw new Error("missing stripe-signature header");
    event = stripe.webhooks.constructEvent(rawBody, sig, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency claim: insert the event row first. If it already exists, this is
  // a retry/replay — ack 200 so Stripe stops, and do nothing else.
  const orgIdFromEvent = orgIdFromMetadata(event);
  const claimed = await claimWebhookEvent({
    stripeEventId: event.id,
    type: event.type,
    payload: event,
    orgId: orgIdFromEvent,
  });
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // One-time only here; subscriptions are logged via invoice.paid (step 7).
        if (session.mode === "payment" && session.payment_status === "paid") {
          await handleOneTimeSession(stripe, session);
        }
        break;
      }
      case "payment_intent.succeeded": {
        // Fallback / non-Checkout path. Idempotent with the session handler via
        // the gift's unique payment_intent id.
        const pi = event.data.object as Stripe.PaymentIntent;
        await handleOneTimePaymentIntent(stripe, pi);
        break;
      }
      case "invoice.paid": {
        // Recurring: first payment + every renewal. Idempotent per invoice id.
        const invoice = event.data.object as InvoiceLoose;
        await handleRecurringInvoice(stripe, invoice, event.id);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpsert(event.id, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const subOrgId = sub.metadata?.org_id;
        if (subOrgId) {
          await setWebhookEventOrg(event.id, subOrgId);
          await setRecurringPlanStatus(subOrgId, sub.id, "canceled", new Date());
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId = idOf(charge.payment_intent);
        if (piId) {
          const refunded = await markRefundedByPaymentIntent(piId);
          if (refunded) await setWebhookEventOrg(event.id, refunded.org_id);
        }
        break;
      }
      default:
        // Claimed & acked; nothing to do for unhandled types.
        break;
    }

    await markWebhookProcessed(event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] error handling ${event.type}`, err);
    await markWebhookError(event.id, message);
    // 500 → Stripe retries; the idempotency claim makes the retry safe.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleOneTimeSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  const m = session.metadata ?? {};
  const orgId = m.org_id;
  // No org_id => not one of our donation sessions (e.g. a raw `stripe trigger`).
  // Ack and ignore rather than 500-retry forever.
  if (!orgId) {
    console.warn("[webhook] checkout.session.completed without org_id metadata — skipping");
    return;
  }

  const paymentIntentId = idOf(session.payment_intent);
  if (!paymentIntentId) throw new Error("checkout.session missing payment_intent");

  const email =
    cleanEmail(m.constituent_email) || cleanEmail(session.customer_details?.email);
  if (!email) throw new Error("checkout.session has no email to match a constituent");

  const address =
    parseAddressMetadata(m.donor_address) ??
    fromStripeAddress(session.customer_details?.address);

  await recordOneTimeGift(stripe, {
    orgId,
    email,
    firstName: m.constituent_first || splitName(session.customer_details?.name).first || null,
    lastName: m.constituent_last || splitName(session.customer_details?.name).last || null,
    address,
    amountCents: session.amount_total ?? 0,
    paymentIntentId,
    customerId: idOf(session.customer),
    fundId: m.fund_id || null,
    campaignId: m.campaign_id || null,
    appealId: m.appeal_id || null,
    fundraiserId: m.fundraiser_id || null,
    tributeType: asTribute(m.tribute_type),
    tributeName: m.tribute_name || null,
  });
}

async function handleOneTimePaymentIntent(stripe: Stripe, pi: Stripe.PaymentIntent) {
  const m = pi.metadata ?? {};
  const orgId = m.org_id;
  // A bare PI without our metadata isn't ours to log (e.g. test triggers). Skip.
  if (!orgId) return;

  const email = cleanEmail(m.constituent_email) || cleanEmail(pi.receipt_email);
  if (!email) throw new Error("payment_intent has no email to match a constituent");

  await recordOneTimeGift(stripe, {
    orgId,
    email,
    firstName: m.constituent_first || null,
    lastName: m.constituent_last || null,
    address: parseAddressMetadata(m.donor_address),
    amountCents: pi.amount_received || pi.amount || 0,
    paymentIntentId: pi.id,
    customerId: idOf(pi.customer),
    fundId: m.fund_id || null,
    campaignId: m.campaign_id || null,
    appealId: m.appeal_id || null,
    fundraiserId: m.fundraiser_id || null,
    tributeType: asTribute(m.tribute_type),
    tributeName: m.tribute_name || null,
  });
}

type OneTimeInput = {
  orgId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  address: AddressJson | null;
  amountCents: number;
  paymentIntentId: string;
  customerId: string | null;
  fundId: string | null;
  campaignId: string | null;
  appealId: string | null;
  fundraiserId: string | null;
  tributeType: TributeType | null;
  tributeName: string | null;
};

async function recordOneTimeGift(stripe: Stripe, input: OneTimeInput) {
  const { constituent } = await upsertConstituentByEmail(input.orgId, {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    address: input.address,
    source: "web_donation",
  });

  const { feeCents, netCents } = await captureFeeNet(stripe, input.paymentIntentId);

  const { gift, created } = await insertGift(input.orgId, {
    constituentId: constituent.id,
    fundId: input.fundId,
    campaignId: input.campaignId,
    appealId: input.appealId,
    fundraiserId: input.fundraiserId,
    giftType: "one_time",
    amountCents: input.amountCents,
    status: "succeeded",
    receivedAt: new Date(),
    stripePaymentIntentId: input.paymentIntentId,
    stripeCustomerId: input.customerId,
    cardLast4: null,
    tributeType: input.tributeType,
    tributeName: input.tributeName,
    feeCents,
    netCents,
  });

  if (!created) {
    // Already logged by the sibling event (session vs payment_intent) or a prior
    // delivery — nothing more to do.
    return;
  }
  await issueReceiptBestEffort(input.orgId, gift.id);
}

/**
 * Receipt issuance is BEST-EFFORT: the gift is the source of truth and is
 * already saved. A receipt/email failure (e.g. unverified sender) must not 500
 * the webhook — the idempotency claim would block a retry anyway, and the admin
 * "resend receipt" action (step 8) recovers it.
 */
async function issueReceiptBestEffort(orgId: string, giftId: string) {
  try {
    const result = await issueReceipt(orgId, giftId);
    console.log(
      `[webhook] receipt ${result.receiptNumber} issued for gift ${giftId} (email ${result.emailId ?? "n/a"})`,
    );
  } catch (err) {
    console.error(`[webhook] receipt issuance failed for gift ${giftId} (gift saved):`, err);
  }
}

// ---------------------------------------------------------------------------
// Recurring (step 7)
// ---------------------------------------------------------------------------

async function handleRecurringInvoice(stripe: Stripe, invoice: InvoiceLoose, eventId: string) {
  const subId = idOf(invoice.subscription ?? null);
  if (!subId) return; // not a subscription invoice (e.g. a one-off) — ignore

  // Subscription metadata is authoritative — retrieve it (its metadata carries
  // org_id/fund_id/donor info we set at checkout). Fall back to invoice metadata.
  let subMeta: Record<string, string> = {};
  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    subMeta = (sub.metadata ?? {}) as Record<string, string>;
  } catch {
    subMeta = (invoice.subscription_details?.metadata ?? invoice.metadata ?? {}) as Record<string, string>;
  }

  const orgId = subMeta.org_id || invoice.metadata?.org_id;
  if (!orgId) {
    console.warn("[webhook] invoice.paid without org_id metadata — skipping");
    return;
  }
  await setWebhookEventOrg(eventId, orgId);

  const email = cleanEmail(subMeta.constituent_email) || cleanEmail(invoice.customer_email);
  if (!email) throw new Error("invoice.paid has no email to match a constituent");

  const { constituent } = await upsertConstituentByEmail(orgId, {
    email,
    firstName: subMeta.constituent_first || null,
    lastName: subMeta.constituent_last || null,
    address: parseAddressMetadata(subMeta.donor_address),
    source: "web_donation",
  });

  const piId = idOf(invoice.payment_intent ?? null);
  const { feeCents, netCents } = piId
    ? await captureFeeNet(stripe, piId)
    : { feeCents: null, netCents: null };

  const { gift, created } = await insertGift(orgId, {
    constituentId: constituent.id,
    fundId: subMeta.fund_id || null,
    campaignId: subMeta.campaign_id || null,
    appealId: subMeta.appeal_id || null,
    fundraiserId: subMeta.fundraiser_id || null,
    giftType: "recurring",
    amountCents: invoice.amount_paid ?? 0,
    status: "succeeded",
    receivedAt: invoice.created ? new Date(invoice.created * 1000) : new Date(),
    stripeInvoiceId: invoice.id, // unique key → idempotent per invoice
    stripePaymentIntentId: piId,
    stripeSubscriptionId: subId,
    stripeCustomerId: idOf(invoice.customer),
    tributeType: asTribute(subMeta.tribute_type),
    tributeName: subMeta.tribute_name || null,
    feeCents,
    netCents,
  });

  if (!created) return; // replay / already logged
  await issueReceiptBestEffort(orgId, gift.id);
}

async function handleSubscriptionUpsert(eventId: string, sub: Stripe.Subscription) {
  const m = (sub.metadata ?? {}) as Record<string, string>;
  const orgId = m.org_id;
  if (!orgId) return; // not one of our subscriptions
  await setWebhookEventOrg(eventId, orgId);

  // Link to the constituent if we know the email (best-effort).
  const email = cleanEmail(m.constituent_email);
  const constituentId = email
    ? (await upsertConstituentByEmail(orgId, { email, source: "web_donation" })).constituent.id
    : null;

  const item = sub.items.data[0];
  await upsertRecurringPlan(orgId, {
    constituentId,
    fundId: m.fund_id || null,
    stripeSubscriptionId: sub.id,
    amountCents: item?.price.unit_amount ?? 0,
    interval: item?.price.recurring?.interval ?? "month",
    status: normalizeSubStatus(sub.status),
    startedAt: sub.start_date ? new Date(sub.start_date * 1000) : null,
  });
}

function normalizeSubStatus(status: Stripe.Subscription.Status): string {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return status;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort: pull actual Stripe fee + net from the charge's balance txn. */
async function captureFeeNet(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<{ feeCents: number | null; netCents: number | null }> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = pi.latest_charge;
    if (charge && typeof charge !== "string") {
      const bt = charge.balance_transaction;
      if (bt && typeof bt !== "string") {
        return { feeCents: bt.fee ?? null, netCents: bt.net ?? null };
      }
    }
  } catch {
    // Under destination charges the fee may live on the connected account's
    // balance txn; precise attribution is refined in step 6. Null is acceptable.
  }
  return { feeCents: null, netCents: null };
}

function orgIdFromMetadata(event: Stripe.Event): string | null {
  const obj = event.data.object as { metadata?: Record<string, string> | null };
  const id = obj?.metadata?.org_id;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

function cleanEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function asTribute(v: string | null | undefined): TributeType | null {
  return v === "in_honor" || v === "in_memory" ? v : null;
}

function splitName(name: string | null | undefined): { first: string | null; last: string | null } {
  if (!name) return { first: null, last: null };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? null, last: null };
  return { first: parts[0] ?? null, last: parts.slice(1).join(" ") || null };
}

function parseAddressMetadata(raw: string | null | undefined): AddressJson | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const addr: AddressJson = {
      line1: str(o.line1),
      line2: str(o.line2),
      city: str(o.city),
      state: str(o.state),
      zip: str(o.zip),
      country: str(o.country),
    };
    return hasAny(addr) ? addr : null;
  } catch {
    return null;
  }
}

function fromStripeAddress(a: Stripe.Address | null | undefined): AddressJson | null {
  if (!a) return null;
  const addr: AddressJson = {
    line1: a.line1 ?? undefined,
    line2: a.line2 ?? undefined,
    city: a.city ?? undefined,
    state: a.state ?? undefined,
    zip: a.postal_code ?? undefined,
    country: a.country ?? undefined,
  };
  return hasAny(addr) ? addr : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function hasAny(a: AddressJson): boolean {
  return Boolean(a.line1 || a.line2 || a.city || a.state || a.zip);
}
