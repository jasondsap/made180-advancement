// ============================================================
// app/api/checkout/route.ts
// Creates a Stripe Checkout Session for a donation.
// Stripe Connect: DESTINATION CHARGES — platform creates the charge,
// funds settle to the org's connected account; receipt/descriptor = the nonprofit.
//
// One-time  -> mode: 'payment'
// Monthly   -> mode: 'subscription'
// PCI: Stripe-hosted checkout. We never see a PAN. SAQ-A.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrgBySlug } from "@/lib/repos/orgs";
import { getFundByCode } from "@/lib/repos/funds";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Application fee in basis points (e.g. 0 = platform takes nothing).
// Set per your arrangement with each org; 0 for NVRE to start.
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? "0");

type CheckoutBody = {
  orgSlug: string;
  fundCode: string;
  frequency: "one_time" | "monthly";
  amountCents: number;
  donor: {
    firstName: string;
    lastName: string;
    email: string;
    address?: {
      line1?: string; line2?: string; city?: string;
      state?: string; postal_code?: string; country?: string;
    };
  };
  tributeType?: "in_honor" | "in_memory" | null;
  tributeName?: string | null;
  employer?: string | null;
  coverFees?: boolean;
};

// Donor opt-in to cover processing fees: gross up so the org nets the intended gift.
// Stripe standard: 2.9% + $0.30 (use your negotiated nonprofit rate if applicable).
function grossUpForFees(amountCents: number): number {
  const FEE_PCT = 0.029;
  const FEE_FIXED = 30;
  return Math.round((amountCents + FEE_FIXED) / (1 - FEE_PCT));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;

    // ---- validate ----
    if (!body.orgSlug || !body.fundCode || !body.amountCents || !body.donor?.email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (body.amountCents < 100) {
      return NextResponse.json({ error: "Minimum gift is $1.00" }, { status: 400 });
    }
    if (body.frequency !== "one_time" && body.frequency !== "monthly") {
      return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
    }

    // ---- resolve org + fund from DB (never trust client labels) ----
    const org = await getOrgBySlug(body.orgSlug);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (!org.stripe_account_id) {
      return NextResponse.json(
        { error: "Organization is not yet set up to receive donations" },
        { status: 409 }
      );
    }
    const fund = await getFundByCode(org.id, body.fundCode);
    if (!fund) {
      return NextResponse.json({ error: "Invalid fund designation" }, { status: 400 });
    }

    const amount = body.coverFees ? grossUpForFees(body.amountCents) : body.amountCents;

    // Metadata travels with the charge and comes back on the webhook —
    // this is how the gift gets reconciled and the constituent matched.
    const metadata: Record<string, string> = {
      org_id: org.id,
      org_slug: org.slug,
      fund_code: fund.code,
      fund_id: fund.id,
      frequency: body.frequency,
      constituent_email: body.donor.email.trim().toLowerCase(),
      constituent_first: body.donor.firstName ?? "",
      constituent_last: body.donor.lastName ?? "",
      intended_amount_cents: String(body.amountCents),
      cover_fees: body.coverFees ? "true" : "false",
      tribute_type: body.tributeType ?? "",
      tribute_name: body.tributeName ?? "",
      employer: body.employer ?? "",
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const success = `${baseUrl}/give/${org.slug}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
    const cancel = `${baseUrl}/give/${org.slug}?canceled=1`;

    const appFee =
      PLATFORM_FEE_BPS > 0 ? Math.round((amount * PLATFORM_FEE_BPS) / 10000) : undefined;

    let session: Stripe.Checkout.Session;

    if (body.frequency === "one_time") {
      // ---------- ONE-TIME: destination charge ----------
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: body.donor.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Donation — ${fund.name}`,
                description: `Gift to ${org.legal_name}`,
              },
            },
          },
        ],
        payment_intent_data: {
          description: `Donation to ${org.legal_name} (${fund.name})`,
          // Charge appears as/settles to the nonprofit:
          on_behalf_of: org.stripe_account_id,
          transfer_data: { destination: org.stripe_account_id },
          ...(appFee ? { application_fee_amount: appFee } : {}),
          metadata,
        },
        metadata,
        success_url: success,
        cancel_url: cancel,
      });
    } else {
      // ---------- MONTHLY: subscription destination charge ----------
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: body.donor.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amount,
              recurring: { interval: "month" },
              product_data: {
                name: `Monthly Donation — ${fund.name}`,
                description: `Recurring gift to ${org.legal_name}`,
              },
            },
          },
        ],
        subscription_data: {
          description: `Monthly donation to ${org.legal_name} (${fund.name})`,
          on_behalf_of: org.stripe_account_id,
          transfer_data: { destination: org.stripe_account_id },
          ...(appFee ? { application_fee_percent: PLATFORM_FEE_BPS / 100 } : {}),
          metadata,
        },
        metadata,
        success_url: success,
        cancel_url: cancel,
      });
    }

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("[checkout] error", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
