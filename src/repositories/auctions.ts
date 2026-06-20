import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { AuctionItem, AuctionBid } from "@/types/db";

/** Auction items + bids. The high bid leads; settlement is handled offline (v1). */
export interface AuctionItemWithBid extends AuctionItem {
  high_bid_cents: number | null;
  bid_count: number;
}

export async function listItems(orgId: string, fundraiserId: string): Promise<AuctionItemWithBid[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT i.*, b.high_bid_cents, COALESCE(b.bid_count, 0)::int AS bid_count
    FROM auction_items i
    LEFT JOIN (
      SELECT auction_item_id, MAX(amount_cents)::int AS high_bid_cents, COUNT(*) AS bid_count
      FROM auction_bids WHERE org_id = ${orgId} GROUP BY auction_item_id
    ) b ON b.auction_item_id = i.id
    WHERE i.org_id = ${orgId} AND i.fundraiser_id = ${fundraiserId}
    ORDER BY i.created_at
  `) as unknown as AuctionItemWithBid[];
}

export async function listPublicItems(fundraiserId: string): Promise<AuctionItemWithBid[]> {
  return (await sql`
    SELECT i.*, b.high_bid_cents, COALESCE(b.bid_count, 0)::int AS bid_count
    FROM auction_items i
    LEFT JOIN (
      SELECT auction_item_id, MAX(amount_cents)::int AS high_bid_cents, COUNT(*) AS bid_count
      FROM auction_bids GROUP BY auction_item_id
    ) b ON b.auction_item_id = i.id
    WHERE i.fundraiser_id = ${fundraiserId}
    ORDER BY i.created_at
  `) as unknown as AuctionItemWithBid[];
}

export async function getItem(orgId: string, id: string): Promise<AuctionItem | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`SELECT * FROM auction_items WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`) as unknown as AuctionItem[];
  return rows[0];
}

/** Public bid validation: current high bid for an item (or null). */
export async function highBid(itemId: string): Promise<number | null> {
  const rows = (await sql`SELECT MAX(amount_cents)::int AS high FROM auction_bids WHERE auction_item_id = ${itemId}`) as unknown as { high: number | null }[];
  return rows[0]?.high ?? null;
}

export async function getItemPublic(itemId: string): Promise<AuctionItem | undefined> {
  const rows = (await sql`SELECT * FROM auction_items WHERE id = ${itemId} LIMIT 1`) as unknown as AuctionItem[];
  return rows[0];
}

export async function createItem(
  orgId: string,
  fundraiserId: string,
  it: { name: string; description?: string | null; imageUrl?: string | null; fmvCents?: number | null; startingBidCents: number; minIncrementCents: number },
): Promise<AuctionItem> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO auction_items (org_id, fundraiser_id, name, description, image_url, fair_market_value_cents, starting_bid_cents, min_increment_cents)
    VALUES (${orgId}, ${fundraiserId}, ${it.name.trim()}, ${it.description ?? null}, ${it.imageUrl ?? null}, ${it.fmvCents ?? null}, ${it.startingBidCents}, ${it.minIncrementCents})
    RETURNING *
  `) as unknown as AuctionItem[];
  return rows[0]!;
}

export async function setItemStatus(orgId: string, id: string, status: "open" | "closed"): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE auction_items SET status = ${status} WHERE org_id = ${orgId} AND id = ${id}`;
}

export async function deleteItem(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM auction_items WHERE org_id = ${orgId} AND id = ${id}`;
}

export async function listBids(orgId: string, itemId: string): Promise<AuctionBid[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM auction_bids WHERE org_id = ${orgId} AND auction_item_id = ${itemId} ORDER BY amount_cents DESC, created_at
  `) as unknown as AuctionBid[];
}

export async function insertBid(
  orgId: string,
  b: { auctionItemId: string; fundraiserId: string; constituentId: string | null; name: string | null; email: string | null; amountCents: number },
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    INSERT INTO auction_bids (org_id, auction_item_id, fundraiser_id, constituent_id, name, email, amount_cents)
    VALUES (${orgId}, ${b.auctionItemId}, ${b.fundraiserId}, ${b.constituentId}, ${b.name}, ${b.email}, ${b.amountCents})
  `;
}
