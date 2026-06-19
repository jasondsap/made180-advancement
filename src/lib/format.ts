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
