/**
 * POST /api/auction/bid — public bid on an auction item. Validates the bid beats
 * the current high bid by at least the item's minimum increment, then records it.
 * Bid settlement (collecting the winner's payment) is handled offline (v1).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOrgBySlug } from "@/repositories/orgs";
import { getPublishedFundraiser } from "@/repositories/fundraisers";
import { getItemPublic, highBid, insertBid } from "@/repositories/auctions";
import { upsertConstituentByEmail } from "@/repositories/constituents";

export const runtime = "nodejs";

const BodySchema = z.object({
  orgSlug: z.string().trim().min(1),
  fundraiserSlug: z.string().trim().min(1),
  itemId: z.string().uuid(),
  name: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email(),
  amountCents: z.number().int().min(1).max(100_000_00),
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
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const fr = await getPublishedFundraiser(body.orgSlug, body.fundraiserSlug);
  if (!fr) return NextResponse.json({ error: "Auction not found" }, { status: 404 });

  const item = await getItemPublic(body.itemId);
  if (!item || item.fundraiser_id !== fr.id) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.status !== "open") return NextResponse.json({ error: "Bidding is closed for this item." }, { status: 409 });

  const current = await highBid(item.id);
  const floor = current != null ? current + item.min_increment_cents : item.starting_bid_cents;
  if (body.amountCents < floor) {
    return NextResponse.json({ error: `Bid must be at least ${(floor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.` }, { status: 409 });
  }

  const { constituent } = await upsertConstituentByEmail(org.id, {
    email: body.email,
    firstName: (body.name || "").split(/\s+/)[0] || null,
    lastName: (body.name || "").split(/\s+/).slice(1).join(" ") || null,
    source: "auction",
  });

  await insertBid(org.id, {
    auctionItemId: item.id,
    fundraiserId: fr.id,
    constituentId: constituent.id,
    name: body.name || null,
    email: body.email,
    amountCents: body.amountCents,
  });

  return NextResponse.json({ ok: true, highBid: body.amountCents });
}
