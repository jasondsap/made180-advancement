/**
 * POST /api/events/checkout — Stripe Checkout for event ticket purchases.
 *
 * Same Connect destination-charge model as donations. Ticket prices + capacity
 * are resolved from the DB (never trusted from the client). The session metadata
 * carries kind=event + the ticket selection so the webhook can create registrants
 * and attribute a gift to the fundraiser.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { requireEnv } from "@/lib/env";
import { getOrgBySlug } from "@/repositories/orgs";
import { getPublishedFundraiser } from "@/repositories/fundraisers";
import { listPublicTicketTypes } from "@/repositories/ticketTypes";

export const runtime = "nodejs";

const BodySchema = z.object({
  orgSlug: z.string().trim().min(1),
  fundraiserSlug: z.string().trim().min(1),
  attendee: z.object({
    name: z.string().trim().max(200).optional().default(""),
    email: z.string().trim().email(),
  }),
  tickets: z.array(z.object({ ticketTypeId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid request" : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const org = await getOrgBySlug(body.orgSlug);
  if (!org?.stripe_account_id) return NextResponse.json({ error: "This organization can't accept payments yet." }, { status: 409 });

  const fr = await getPublishedFundraiser(body.orgSlug, body.fundraiserSlug);
  if (!fr || fr.type !== "event") return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!fr.payments_enabled) return NextResponse.json({ error: "This event is not selling tickets right now." }, { status: 409 });

  // Resolve ticket types from the DB (price + capacity authority).
  const available = await listPublicTicketTypes(fr.id);
  const byId = new Map(available.map((t) => [t.id, t]));

  const lineItems: { price_data: { currency: string; unit_amount: number; product_data: { name: string } }; quantity: number }[] = [];
  const ticketMap: Record<string, number> = {};
  for (const sel of body.tickets) {
    const t = byId.get(sel.ticketTypeId);
    if (!t) return NextResponse.json({ error: "A selected ticket is no longer available." }, { status: 400 });
    if (t.capacity != null && t.sold + sel.quantity > t.capacity) {
      return NextResponse.json({ error: `“${t.name}” doesn’t have enough tickets remaining.` }, { status: 409 });
    }
    lineItems.push({
      price_data: { currency: "usd", unit_amount: t.price_cents, product_data: { name: `${fr.title} — ${t.name}` } },
      quantity: sel.quantity,
    });
    ticketMap[t.id] = sel.quantity;
  }
  if (lineItems.length === 0) return NextResponse.json({ error: "Select at least one ticket." }, { status: 400 });

  const email = body.attendee.email.trim().toLowerCase();
  const metadata: Record<string, string> = {
    kind: "event",
    org_id: org.id,
    org_slug: org.slug,
    fundraiser_id: fr.id,
    attendee_email: email,
    attendee_name: body.attendee.name ?? "",
    tickets: JSON.stringify(ticketMap),
  };

  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const connected = org.stripe_account_id;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: lineItems,
      payment_intent_data: {
        description: `Tickets — ${fr.title}`,
        on_behalf_of: connected,
        transfer_data: { destination: connected },
        metadata,
      },
      metadata,
      success_url: `${base}/give/${org.slug}/${fr.slug}?registered=1`,
      cancel_url: `${base}/give/${org.slug}/${fr.slug}?canceled=1`,
    });
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    const e = err as { message?: string };
    console.error("[events/checkout] Stripe error", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again.", detail: e?.message ?? "unknown" }, { status: 500 });
  }
}
