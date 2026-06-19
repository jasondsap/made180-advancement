/**
 * POST /api/checkout
 * Creates a Stripe Checkout Session for a donation.
 *
 * Stripe Connect — DESTINATION CHARGES: the platform creates the charge, funds
 * settle to the org's connected account, and `on_behalf_of` makes the nonprofit
 * the merchant of record (receipts + statement descriptor show the nonprofit).
 *
 * One-time -> mode 'payment'; Monthly -> mode 'subscription'.
 * PCI: Stripe-hosted checkout, no PAN touches us. SAQ-A.
 *
 * Trust model: org + fund are resolved from the DB by slug/code — we never trust
 * client-supplied labels, ids, or amounts-as-truth beyond the cents value.
 */
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { requireEnv } from "@/lib/env";
import { getOrgBySlug } from "@/repositories/orgs";
import { getFundByCode } from "@/repositories/funds";
import { getAppealById } from "@/repositories/appeals";
import { grossUpForFees } from "@/domain/fees";

export const runtime = "nodejs";

const AddressSchema = z.object({
  line1: z.string().trim().max(200).optional().default(""),
  line2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  zip: z.string().trim().max(20).optional().default(""),
  country: z.string().trim().max(2).optional().default("US"),
});

const BodySchema = z.object({
  orgSlug: z.string().trim().min(1),
  fundCode: z.string().trim().min(1),
  frequency: z.enum(["one_time", "monthly"]),
  amountCents: z.number().int().min(100, "Minimum gift is $1.00").max(100_000_00),
  donor: z.object({
    firstName: z.string().trim().max(120).optional().default(""),
    lastName: z.string().trim().max(120).optional().default(""),
    email: z.string().trim().email(),
    address: AddressSchema.optional(),
  }),
  tributeType: z.enum(["in_honor", "in_memory"]).nullable().optional(),
  tributeName: z.string().trim().max(200).nullable().optional(),
  employer: z.string().trim().max(200).nullable().optional(),
  coverFees: z.boolean().optional().default(false),
  appealId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid request" : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Resolve org + fund from the DB — source of truth, not client labels.
  const org = await getOrgBySlug(body.orgSlug);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (!org.stripe_account_id) {
    return NextResponse.json(
      { error: "This organization is not yet set up to receive online donations." },
      { status: 409 },
    );
  }
  const fund = await getFundByCode(org.id, body.fundCode);
  if (!fund || !fund.active) {
    return NextResponse.json({ error: "Invalid fund designation" }, { status: 400 });
  }

  // Optional appeal attribution (from a tracking link ?appeal=<id>). Resolve it
  // from the DB so a bogus id can't poison the gift; derive its campaign too.
  let appealId = "";
  let appealCampaignId = "";
  if (body.appealId) {
    const appeal = await getAppealById(org.id, body.appealId);
    if (appeal) {
      appealId = appeal.id;
      appealCampaignId = appeal.campaign_id ?? "";
    }
  }

  const intendedCents = body.amountCents;
  const chargeCents = body.coverFees ? grossUpForFees(intendedCents) : intendedCents;

  const donorName = [body.donor.firstName, body.donor.lastName].filter(Boolean).join(" ").trim();
  const email = body.donor.email.trim().toLowerCase();

  // Metadata rides with the charge and returns on the webhook — the reconciliation
  // + constituent-match payload. All values must be strings.
  const metadata: Record<string, string> = {
    org_id: org.id,
    org_slug: org.slug,
    fund_code: fund.code,
    fund_id: fund.id,
    frequency: body.frequency,
    constituent_email: email,
    constituent_name: donorName,
    constituent_first: body.donor.firstName ?? "",
    constituent_last: body.donor.lastName ?? "",
    intended_amount_cents: String(intendedCents),
    cover_fees: body.coverFees ? "true" : "false",
    tribute_type: body.tributeType ?? "",
    tribute_name: body.tributeName ?? "",
    employer: body.employer ?? "",
    donor_address: body.donor.address ? JSON.stringify(body.donor.address) : "",
    appeal_id: appealId,
    campaign_id: appealCampaignId,
  };

  const baseUrl = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const success = `${baseUrl}/give/${org.slug}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
  const cancel = `${baseUrl}/give/${org.slug}?canceled=1`;
  const connectedAccount = org.stripe_account_id;

  const stripe = getStripe();
  try {
    let session: Stripe.Checkout.Session;

    if (body.frequency === "one_time") {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: chargeCents,
              product_data: {
                name: `Donation — ${fund.name}`,
                description: `Gift to ${org.legal_name}`,
              },
            },
          },
        ],
        payment_intent_data: {
          description: `Donation to ${org.legal_name} (${fund.name})`,
          on_behalf_of: connectedAccount,
          transfer_data: { destination: connectedAccount },
          metadata,
        },
        metadata,
        success_url: success,
        cancel_url: cancel,
      });
    } else {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: chargeCents,
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
          on_behalf_of: connectedAccount,
          transfer_data: { destination: connectedAccount },
          metadata,
        },
        metadata,
        success_url: success,
        cancel_url: cancel,
      });
    }

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("[checkout] Stripe error", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
