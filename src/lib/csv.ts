/**
 * Minimal RFC-4180 CSV parser (quoted fields, embedded commas/quotes/newlines,
 * CRLF or LF). No dependency; used client-side by the import wizard. Returns
 * rows of string cells; the caller interprets row 0 as the header.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM (Excel exports lead with one).
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      // Skip fully-empty trailing lines but keep intentional empty cells.
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** "$1,234.56" | "1234.56" | "1,234" → integer cents; null when unparseable. */
export function parseMoneyToCents(v: string): number | null {
  const cleaned = v.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** "2024-03-05" | "3/5/2024" | "03/05/24" → "YYYY-MM-DD"; null when unparseable. */
export function parseDateToIso(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return toIso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) {
    let year = +m[3]!;
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return toIso(year, +m[1]!, +m[2]!);
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function toIso(y: number, mo: number, d: number): string | null {
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
