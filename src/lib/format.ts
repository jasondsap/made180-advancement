/** Shared display formatters for the admin app. */

export function usd(cents: number, opts: { cents?: boolean } = {}): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ?? cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtNumber(v: number): string {
  return v.toLocaleString("en-US");
}

/**
 * 'YYYY-MM-DD' from a Date or date-ish string. pg returns `date` columns as JS
 * Dates (local midnight), so format by local calendar parts — never toISOString,
 * which can shift a day across timezones.
 */
export function isoDay(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return String(d).slice(0, 10);
}
