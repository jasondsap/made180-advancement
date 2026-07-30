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
 * 'HH:MM[:SS]' → '2:30 PM'. For pg `time` columns (wall clock, no zone — see
 * migration 0023), so this parses the string directly rather than going through
 * Date, which would attach a timezone the value doesn't have.
 */
export function fmtTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t));
  if (!m) return null;
  const h = Number(m[1]);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** 'HH:MM' for <input type="time" defaultValue>, which rejects seconds-precision. */
export function timeInputValue(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{2}):(\d{2})/.exec(String(t));
  return m ? `${m[1]}:${m[2]}` : "";
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
