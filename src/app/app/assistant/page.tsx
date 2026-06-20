"use client";

import { useState } from "react";

interface QueryResult {
  answer: string;
  table?: { columns: string[]; rows: string[][] };
}

const EXAMPLES = [
  "How much have we raised year to date?",
  "Who are our top 10 donors?",
  "Show giving by fund this year",
  "How many recurring donors do we have?",
  "Who lapsed since last year?",
];

export default function AssistantPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    setLoading(true); setError(null); setResult(null); setQ(question);
    try {
      const res = await fetch("/api/assistant/query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setResult(data);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Assistant</h1>
      <p style={{ color: "#777", fontSize: ".9rem", marginTop: 0 }}>
        Ask about your donors and giving in plain English. Answers run safe, org-scoped queries — no raw SQL.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()); }} style={{ display: "flex", gap: ".5rem" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How much have we raised this month?" style={{ flex: 1, padding: ".6rem .7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".95rem" }} />
        <button type="submit" disabled={loading} style={{ padding: ".6rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginTop: ".75rem" }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => ask(ex)} style={{ background: "#eef4f0", border: "1px solid #cfe0d6", color: "var(--brand)", borderRadius: 99, padding: "3px 10px", fontSize: ".8rem", cursor: "pointer" }}>{ex}</button>
        ))}
      </div>

      {error && <p style={{ color: "#9b1c1c", marginTop: "1rem" }}>{error}</p>}

      {result && (
        <section style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", marginTop: "1.25rem" }}>
          <p style={{ margin: 0, fontSize: ".98rem" }}>{result.answer}</p>
          {result.table && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem", marginTop: ".75rem" }}>
              <thead><tr style={{ textAlign: "left", color: "#888" }}>{result.table.columns.map((c) => <th key={c} style={{ padding: ".4rem .5rem" }}>{c}</th>)}</tr></thead>
              <tbody>
                {result.table.rows.map((row, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f1f2f1" }}>{row.map((cell, j) => <td key={j} style={{ padding: ".4rem .5rem" }}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
