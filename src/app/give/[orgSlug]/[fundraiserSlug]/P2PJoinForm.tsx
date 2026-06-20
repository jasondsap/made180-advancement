"use client";

import { useState, type CSSProperties } from "react";

/** Self-serve "start fundraising" form → creates a p2p member, redirects to their page. */
export function P2PJoinForm({ orgSlug, fundraiserSlug }: { orgSlug: string; fundraiserSlug: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/p2p/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          fundraiserSlug,
          name,
          email,
          goal: goal ? Math.round(parseFloat(goal) * 100) : undefined,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={btnPrimary}>Start fundraising</button>;
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: ".5rem", border: "1px solid #e3ddd0", borderRadius: 10, padding: "1rem" }}>
      <strong style={{ fontSize: ".95rem" }}>Create your fundraising page</strong>
      <input style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={input} type="number" min="0" step="1" placeholder="Your goal ($, optional)" value={goal} onChange={(e) => setGoal(e.target.value)} />
      {error && <p style={{ color: "#b00020", fontSize: ".85rem", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: ".5rem" }}>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? "Creating…" : "Create my page"}</button>
        <button type="button" onClick={() => setOpen(false)} style={btnGhost}>Cancel</button>
      </div>
    </form>
  );
}

const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: ".6rem .7rem", fontSize: ".95rem", border: "1px solid #ccc", borderRadius: 8 };
const btnPrimary: CSSProperties = { padding: ".6rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".92rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: CSSProperties = { padding: ".6rem 1.1rem", borderRadius: 8, background: "transparent", color: "var(--brand)", border: "1px solid #ccc", fontSize: ".92rem", fontWeight: 600, cursor: "pointer" };
