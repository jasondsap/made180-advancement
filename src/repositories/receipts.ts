import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

/**
 * Receipt numbering — sequential per org, per year, e.g. NVRE-2026-000001.
 *
 * Allocation is atomic via the receipt_counters table (PK on org_id, year):
 * the INSERT ... ON CONFLICT DO UPDATE bumps last_value under a row lock, so
 * concurrent webhooks can't collide. Gaps from downstream failures are
 * acceptable — IRS substantiation does not require gapless numbering.
 */
export async function allocateReceiptNumber(
  orgId: string,
  slug: string,
  year: number,
): Promise<string> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO receipt_counters (org_id, year, last_value)
    VALUES (${orgId}, ${year}, 1)
    ON CONFLICT (org_id, year)
    DO UPDATE SET last_value = receipt_counters.last_value + 1
    RETURNING last_value
  `) as unknown as Array<{ last_value: number }>;
  const seq = Number(rows[0]?.last_value ?? 0);
  return `${slug.toUpperCase()}-${year}-${String(seq).padStart(6, "0")}`;
}

/** Persist the allocated number on the gift (before attempting delivery). */
export async function setGiftReceiptNumber(
  orgId: string,
  giftId: string,
  receiptNumber: string,
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE gifts SET receipt_number = ${receiptNumber}
    WHERE org_id = ${orgId} AND id = ${giftId}
  `;
}

/** Mark the receipt as delivered. */
export async function markGiftReceiptSent(
  orgId: string,
  giftId: string,
  sentAt: Date,
): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE gifts SET receipt_sent_at = ${sentAt.toISOString()}
    WHERE org_id = ${orgId} AND id = ${giftId}
  `;
}
