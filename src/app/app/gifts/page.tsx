import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { listGiftsFiltered, countGiftsFiltered, type GiftFilters } from "@/repositories/gifts";
import { listFunds } from "@/repositories/funds";
import { usd, fmtDate } from "@/lib/format";
import type { GiftListRow } from "@/repositories/gifts";

const PAGE_SIZE = 50;
const TYPES = ["one_time", "recurring", "pledge", "in_kind", "check", "matching", "stock"];
const STATUSES = ["succeeded", "pending", "failed", "refunded"];

function donorName(g: GiftListRow): string {
  const person = [g.donor_first, g.donor_last].filter(Boolean).join(" ");
  return g.donor_org || person || g.donor_email || "—";
}

export default async function GiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const sp = await searchParams;

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filters: GiftFilters = {
    fundId: sp.fund || null,
    giftType: sp.type || null,
    status: sp.status || null,
    dateFrom: sp.from || null,
    dateTo: sp.to || null,
    search: sp.q || null,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const [funds, gifts, total] = await Promise.all([
    listFunds(ctx.orgId),
    listGiftsFiltered(ctx.orgId, filters),
    countGiftsFiltered(ctx.orgId, filters),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { fund: sp.fund, type: sp.type, status: sp.status, from: sp.from, to: sp.to, q: sp.q, page: sp.page, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/app/gifts?${p.toString()}`;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Gifts</h1>
        <Link href="/app/gifts/new" style={btnPrimary}>Record gift</Link>
      </div>

      {/* Filters (plain GET form — no client JS) */}
      <form method="get" style={filterBar}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search donor / email" style={inp} />
        <select name="fund" defaultValue={sp.fund ?? ""} style={inp}>
          <option value="">All funds</option>
          {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} style={inp}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} style={inp}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ""} style={inp} />
        <input type="date" name="to" defaultValue={sp.to ?? ""} style={inp} />
        <button type="submit" style={btn}>Filter</button>
        <Link href="/app/gifts" style={{ ...btn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Clear</Link>
      </form>

      <p style={{ color: "#888", fontSize: ".85rem", margin: ".75rem 0" }}>{total} gift{total === 1 ? "" : "s"}</p>

      <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#777", background: "#fafbfa" }}>
              <Th>Date</Th><Th>Donor</Th><Th>Fund</Th><Th>Type</Th><Th right>Amount</Th><Th>Status</Th><Th>Receipt</Th>
            </tr>
          </thead>
          <tbody>
            {gifts.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "1.5rem", textAlign: "center", color: "#999" }}>No gifts match these filters.</td></tr>
            )}
            {gifts.map((g) => (
              <tr key={g.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                <Td><Link href={`/app/gifts/${g.id}`} style={{ color: "#1c6e3c", textDecoration: "none" }}>{fmtDate(g.received_at)}</Link></Td>
                <Td>{donorName(g)}</Td>
                <Td>{g.fund_name ?? "—"}</Td>
                <Td>{g.gift_type}</Td>
                <Td right><strong>{usd(g.amount_cents)}</strong></Td>
                <Td><StatusPill status={g.status} /></Td>
                <Td>{g.receipt_number ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: "1rem", alignItems: "center" }}>
          {page > 1 && <Link href={qs({ page: page - 1 })} style={btn}>← Prev</Link>}
          <span style={{ fontSize: ".85rem", color: "#666" }}>Page {page} of {pages}</span>
          {page < pages && <Link href={qs({ page: page + 1 })} style={btn}>Next →</Link>}
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: ".6rem .8rem", textAlign: right ? "right" : "left", fontWeight: 600 }}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td style={{ padding: ".6rem .8rem", textAlign: right ? "right" : "left" }}>{children}</td>;
}
function StatusPill({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    succeeded: ["#e8f5ec", "#1c6e3c"], pending: ["#fff4e5", "#7a4f00"],
    failed: ["#fdecec", "#9b1c1c"], refunded: ["#eef0f2", "#555"],
  };
  const [bg, fg] = colors[status] ?? ["#eee", "#555"];
  return <span style={{ background: bg, color: fg, padding: "2px 8px", borderRadius: 99, fontSize: ".78rem" }}>{status}</span>;
}

const inp: React.CSSProperties = { padding: ".45rem .55rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".88rem" };
const btn: React.CSSProperties = { padding: ".45rem .8rem", border: "1px solid #ccc", borderRadius: 7, background: "#fff", fontSize: ".88rem", cursor: "pointer", color: "#333" };
const btnPrimary: React.CSSProperties = { padding: ".5rem .9rem", borderRadius: 8, background: "#1c6e3c", color: "#fff", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 };
const filterBar: React.CSSProperties = { display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: "1rem", alignItems: "center" };
