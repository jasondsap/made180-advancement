"use client";

import { useState, type CSSProperties } from "react";

type Item = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: string;
  startingBidCents: number;
  minIncrementCents: number;
  highBidCents: number | null;
  bidCount: number;
};

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0 });

export function AuctionItems({ orgSlug, fundraiserSlug, items }: { orgSlug: string; fundraiserSlug: string; items: Item[] }) {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {items.map((it) => <AuctionCard key={it.id} orgSlug={orgSlug} fundraiserSlug={fundraiserSlug} item={it} />)}
      {items.length === 0 && <p style={{ color: "#888" }}>No auction items yet. Check back soon.</p>}
    </div>
  );
}

function AuctionCard({ orgSlug, fundraiserSlug, item }: { orgSlug: string; fundraiserSlug: string; item: Item }) {
  const minNext = (item.highBidCents != null ? item.highBidCents + item.minIncrementCents : item.startingBidCents);
  const [amount, setAmount] = useState(String(minNext / 100));
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const closed = item.status !== "open";

  async function bid(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug, fundraiserSlug, itemId: item.id, name, email, amountCents: Math.round(parseFloat(amount) * 100) }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setMsg({ ok: false, text: data.error ?? "Bid failed." });
      else { setMsg({ ok: true, text: "You're the high bidder! Refresh to see updated bids." }); }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    }
    setBusy(false);
  }

  return (
    <div style={{ border: "1px solid #e3ddd0", borderRadius: 12, overflow: "hidden" }}>
      {item.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.imageUrl} alt={item.name} style={{ width: "100%", maxHeight: 220, objectFit: "cover" }} />}
      <div style={{ padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{item.name}</h3>
          {closed && <span style={{ fontSize: ".78rem", color: "#9b1c1c" }}>Closed</span>}
        </div>
        {item.description && <p style={{ color: "#666", fontSize: ".9rem", margin: ".4rem 0" }}>{item.description}</p>}
        <p style={{ margin: ".4rem 0", fontSize: ".95rem" }}>
          {item.highBidCents != null ? <>Current bid <strong style={{ color: "var(--brand)" }}>{usd(item.highBidCents)}</strong> · {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}</> : <>Starting bid <strong>{usd(item.startingBidCents)}</strong></>}
        </p>
        {!closed && (
          <form onSubmit={bid} style={{ display: "grid", gap: ".4rem", marginTop: ".6rem" }}>
            <div style={{ display: "flex", gap: ".4rem" }}>
              <input style={{ ...input, flex: 1 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <input style={{ ...input, flex: 1 }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div style={{ display: "flex", gap: ".4rem" }}>
              <input style={{ ...input, flex: 1 }} type="number" min={minNext / 100} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Bid amount" />
              <button type="submit" disabled={busy} style={btnPrimary}>{busy ? "…" : "Place bid"}</button>
            </div>
            <p style={{ fontSize: ".75rem", color: "#888", margin: 0 }}>Minimum next bid: {usd(minNext)}</p>
            {msg && <p style={{ fontSize: ".82rem", color: msg.ok ? "var(--forest)" : "#b00020", margin: 0 }}>{msg.text}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

const input: CSSProperties = { boxSizing: "border-box", padding: ".5rem .6rem", fontSize: ".9rem", border: "1px solid #ccc", borderRadius: 8 };
const btnPrimary: CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
