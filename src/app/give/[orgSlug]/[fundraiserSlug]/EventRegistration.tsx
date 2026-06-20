"use client";

import { useMemo, useState, type CSSProperties } from "react";

type Ticket = { id: string; name: string; description: string | null; priceCents: number; remaining: number | null };

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0 });

export function EventRegistration({
  orgSlug,
  fundraiserSlug,
  tickets,
  enabled,
}: {
  orgSlug: string;
  fundraiserSlug: string;
  tickets: Ticket[];
  enabled: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => tickets.reduce((s, t) => s + (qty[t.id] ?? 0) * t.priceCents, 0), [qty, tickets]);
  const count = useMemo(() => Object.values(qty).reduce((s, n) => s + n, 0), [qty]);

  const setTicketQty = (id: string, n: number, max: number | null) => {
    const capped = Math.max(0, max != null ? Math.min(n, max) : n);
    setQty((q) => ({ ...q, [id]: capped }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (count < 1) return setError("Select at least one ticket.");
    if (!email.trim()) return setError("Enter your email for confirmation.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/events/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          fundraiserSlug,
          attendee: { name, email },
          tickets: tickets.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] })),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (tickets.length === 0) {
    return <p style={{ color: "#888" }}>Tickets aren’t available yet. Please check back soon.</p>;
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: "grid", gap: ".6rem", marginBottom: "1.25rem" }}>
        {tickets.map((t) => {
          const soldOut = t.remaining != null && t.remaining <= 0;
          return (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e3ddd0", borderRadius: 10, padding: ".8rem 1rem", opacity: soldOut ? 0.55 : 1 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{t.name} · {usd(t.priceCents)}</div>
                {t.description && <div style={{ fontSize: ".85rem", color: "#777" }}>{t.description}</div>}
                {t.remaining != null && <div style={{ fontSize: ".78rem", color: soldOut ? "#9b1c1c" : "#888" }}>{soldOut ? "Sold out" : `${t.remaining} left`}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                <button type="button" onClick={() => setTicketQty(t.id, (qty[t.id] ?? 0) - 1, t.remaining)} style={stepper} disabled={soldOut}>−</button>
                <span style={{ width: 24, textAlign: "center" }}>{qty[t.id] ?? 0}</span>
                <button type="button" onClick={() => setTicketQty(t.id, (qty[t.id] ?? 0) + 1, t.remaining)} style={stepper} disabled={soldOut}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: ".5rem", marginBottom: "1rem" }}>
        <input style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <input style={input} type="email" required placeholder="Email (for confirmation)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>

      {error && <p style={{ color: "#b00020", fontSize: ".9rem", margin: "0 0 .75rem" }} role="alert">{error}</p>}

      <button type="submit" disabled={!enabled || submitting || count < 1} style={{ width: "100%", padding: ".9rem", fontSize: "1.05rem", fontWeight: 600, color: "#fff", background: "var(--brand)", border: "none", borderRadius: 10, cursor: "pointer", opacity: !enabled || count < 1 ? 0.5 : 1 }}>
        {submitting ? "Redirecting to checkout…" : count > 0 ? `Register · ${usd(total)}` : "Select tickets"}
      </button>
    </form>
  );
}

const stepper: CSSProperties = { width: 30, height: 30, borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "1rem" };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: ".7rem .8rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 8, background: "#fff" };
