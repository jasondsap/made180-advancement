import type { GiftListRow } from "@/repositories/gifts";

/**
 * QuickBooks-friendly CSV of gifts. Columns map cleanly to a sales-receipt /
 * deposit import: each row is one gift with the fund as the income account/class
 * so the bookkeeper can map funds → accounts in QuickBooks. Amounts in dollars.
 */
const HEADERS = [
  "Date",
  "Donor",
  "Email",
  "Fund",
  "GiftType",
  "Status",
  "Amount",
  "Fee",
  "Net",
  "ReceiptNumber",
  "StripePaymentIntent",
  "StripeInvoice",
] as const;

function donorName(g: GiftListRow): string {
  return (
    g.donor_org ||
    [g.donor_first, g.donor_last].filter(Boolean).join(" ") ||
    g.donor_email ||
    "Anonymous"
  );
}

function dollars(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** Escape a CSV cell per RFC 4180. */
function cell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildQuickBooksCsv(rows: GiftListRow[]): string {
  const lines: string[] = [HEADERS.join(",")];
  for (const g of rows) {
    lines.push(
      [
        isoDate(g.received_at),
        donorName(g),
        g.donor_email ?? "",
        g.fund_name ?? "",
        g.gift_type,
        g.status,
        dollars(g.amount_cents),
        dollars(g.fee_cents),
        dollars(g.net_cents),
        g.receipt_number ?? "",
        g.stripe_payment_intent_id ?? "",
        g.stripe_invoice_id ?? "",
      ]
        .map((c) => cell(String(c)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}
