// ============================================================
// app/api/stripe/webhook/route.ts
// Stripe webhook -> auto-log donations. THE feature Lauren asked for.
//
// Guarantees:
//  - Signature verified against STRIPE_WEBHOOK_SECRET
//  - Idempotent: same stripe_event_id is never processed twice
//  - Constituents dedupe on (org_id, lower(email)) — no duplicate donors
//  - Raw body (Next.js App Router: req.text(), NOT parsed JSON)
//
// Connect note: events for connected accounts arrive with `event.account`.
// With destination charges the PaymentIntent lives on the PLATFORM account,
// so the platform webhook secret verifies them. If you later add a
// Connect webhook endpoint, verify those with the connect signing secret.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookError,
} from "@/lib/repos/webhookEvents";
import { upsertConstituentByEmail } from "@/lib/repos/constituents";
import {
  insertGift,
  giftExistsForPaymentIntent,
  markGiftRefunded,
} from "@/lib/repos/gifts";
import { upsertRecurringPlan, setRecurringPlanStatus } from "@/lib/repos/recurringPlans";
import { nextReceiptNumber } from "@/lib/repos/receipts";
import { sendReceiptEmail } from "@/lib/receipts/send";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Next.js App Router needs the raw body for signature verification.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ---- idempotency claim: insert the event row; if it already exists, ack & exit ----
  const claimed = await claimWebhookEvent({
    stripeEventId: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (!claimed) {
    // Already seen — Stripe is retrying. Ack 200 so it stops.
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // For one-time payments. Subscriptions are logged via invoice.paid instead.
        if (session.mode === "payment" && session.payment_status === "paid") {
          await handleOneTime(session);
        }
        break;
      }

      case "invoice.paid": {
        // Recurring monthly gifts (first + every renewal).
        const invoice = event.data.object as Stripe.Invoice;
        await handleRecurringInvoice(invoice);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpsert(sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await setRecurringPlanStatus(sub.id, "canceled", new Date());
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          await markGiftRefunded(String(charge.payment_intent));
        }
        break;
      }

      default:
        // Unhandled event types are fine — we claimed & ack them.
        break;
    }

    await markWebhookProcessed(event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[webhook] error handling ${event.type}`, err);
    await markWebhookError(event.id, String(err));
    // 500 -> Stripe retries. Idempotency claim makes the retry safe.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

// ---------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------

async function handleOneTime(session: Stripe.Checkout.Session) {
  const m = session.metadata ?? {};
  const orgId = m.org_id;
  if (!orgId) throw new Error("checkout.session missing org_id metadata");

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error("checkout.session missing payment_intent");

  // Second-layer idempotency: don't double-insert a gift for the same PI.
  if (await giftExistsForPaymentIntent(paymentIntentId)) return;

  const email = (m.constituent_email || session.customer_details?.email || "")
    .trim()
    .toLowerCase();

  const constituent = await upsertConstituentByEmail(orgId, {
    email,
    firstName: m.constituent_first || session.customer_details?.name?.split(" ")[0] || null,
    lastName: m.constituent_last || null,
    addressJson: session.customer_details?.address ?? null,
    source: "web_donation",
  });

  const receiptNumber = await nextReceiptNumber(orgId);

  const gift = await insertGift({
    orgId,
    constituentId: constituent.id,
    fundId: m.fund_id || null,
    giftType: "one_time",
    amountCents: session.amount_total ?? 0,
    status: "succeeded",
    receivedAt: new Date(),
    stripePaymentIntentId: paymentIntentId,
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    tributeType: m.tribute_type || null,
    tributeName: m.tribute_name || null,
    receiptNumber,
  });

  await sendReceiptEmail({ orgId, gift, constituent, receiptNumber });
}

async function handleRecurringInvoice(invoice: Stripe.Invoice) {
  // Pull metadata from the subscription (lines carry it through Checkout).
  const subId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;
  if (!subId) return; // not a subscription invoice

  const m = invoice.lines.data[0]?.metadata ?? invoice.metadata ?? {};
  const orgId = m.org_id;
  if (!orgId) throw new Error("invoice missing org_id metadata");

  const paymentIntentId =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent?.id;
  if (paymentIntentId && (await giftExistsForPaymentIntent(paymentIntentId))) return;

  const email = (m.constituent_email || invoice.customer_email || "")
    .trim()
    .toLowerCase();

  const constituent = await upsertConstituentByEmail(orgId, {
    email,
    firstName: m.constituent_first || null,
    lastName: m.constituent_last || null,
    source: "web_donation",
  });

  const receiptNumber = await nextReceiptNumber(orgId);

  const gift = await insertGift({
    orgId,
    constituentId: constituent.id,
    fundId: m.fund_id || null,
    giftType: "recurring",
    amountCents: invoice.amount_paid,
    status: "succeeded",
    receivedAt: new Date(invoice.created * 1000),
    stripePaymentIntentId: paymentIntentId ?? null,
    stripeSubscriptionId: subId,
    stripeCustomerId:
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
    receiptNumber,
  });

  await sendReceiptEmail({ orgId, gift, constituent, receiptNumber });
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const m = sub.metadata ?? {};
  const orgId = m.org_id;
  if (!orgId) return; // platform-only subs we don't track

  const email = (m.constituent_email || "").trim().toLowerCase();
  const constituent = email
    ? await upsertConstituentByEmail(orgId, { email, source: "web_donation" })
    : null;

  const item = sub.items.data[0];
  await upsertRecurringPlan({
    orgId,
    constituentId: constituent?.id ?? null,
    fundId: m.fund_id || null,
    stripeSubscriptionId: sub.id,
    amountCents: item?.price.unit_amount ?? 0,
    interval: item?.price.recurring?.interval ?? "month",
    status: sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : sub.status,
    startedAt: new Date(sub.start_date * 1000),
  });
}
