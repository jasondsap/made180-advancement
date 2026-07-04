import { NextResponse } from "next/server";
import { verifyManageBillingToken } from "@/lib/engageTokens";
import { getConstituentById } from "@/repositories/constituents";
import { getOrgById } from "@/repositories/orgs";
import { getStripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";

/**
 * Donor self-service: /manage/[token] verifies a signed manage-billing token and
 * opens a Stripe Billing Portal session for the donor's customer, where they can
 * update their card, change, or cancel their recurring gift — no login required.
 * Requires the Billing Portal to be configured on the platform Stripe account.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(message: string, status = 400): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manage your gift</title></head>
     <body style="font-family:Georgia,serif;max-width:520px;margin:4rem auto;padding:0 1.25rem;color:#2B2620">
       <h1>Manage your recurring gift</h1><p>${message}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(`manage:${clientIp(req)}`, { limit: 20, windowSecs: 60 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSecs);

  const { token } = await params;
  const decoded = verifyManageBillingToken(token);
  if (!decoded) return page("This link is invalid or has expired. Please contact the organization.");

  const con = await getConstituentById(decoded.orgId, decoded.constituentId);
  if (!con?.stripe_customer_id) {
    return page("We couldn't find a recurring gift linked to this account. Please contact the organization.");
  }

  const base = (env().APP_BASE_URL ?? "").replace(/\/$/, "");
  const org = await getOrgById(decoded.orgId);
  const returnUrl = org ? `${base}/give/${org.slug}` : `${base}/`;

  try {
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: con.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.redirect(portal.url, 303);
  } catch (err) {
    console.error("[manage] billing portal session failed:", err);
    return page("We couldn't open the billing portal right now. Please try again later.", 502);
  }
}
