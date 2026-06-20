"use client";

import { useState } from "react";

export function ThankYouButton({ giftId }: { giftId: string }) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/assistant/thank-you", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giftId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed.");
      else setDraft(data.draft);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <button onClick={generate} disabled={loading} style={{ padding: ".5rem .9rem", border: "1px solid #cfe0d6", borderRadius: 8, background: "#eef4f0", color: "var(--brand)", cursor: "pointer", fontSize: ".9rem", fontWeight: 600 }}>
        {loading ? "Drafting…" : "✨ Draft thank-you"}
      </button>
      {error && <p style={{ color: "#9b1c1c", fontSize: ".85rem" }}>{error}</p>}
      {draft && (
        <textarea readOnly value={draft} rows={8} style={{ width: "100%", marginTop: ".5rem", padding: ".7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".9rem", fontFamily: "inherit", boxSizing: "border-box" }} />
      )}
    </div>
  );
}
