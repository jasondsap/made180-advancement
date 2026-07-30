"use client";

import { useEffect, useRef, useState } from "react";

interface Hit {
  id: string;
  name: string;
  email: string | null;
}

/**
 * Typeahead that links a form to a constituent. Writes the chosen id into a
 * hidden input named `name` so it posts with the surrounding <form> — no
 * client state plumbing needed by the parent.
 *
 * A <select> of every constituent isn't viable here: an org this product targets
 * has thousands, and the picker also appears on the always-visible task form.
 */
export function ConstituentPicker({
  name = "constituentId",
  initial = null,
  placeholder = "Search constituents…",
}: {
  name?: string;
  initial?: { id: string; name: string } | null;
  placeholder?: string;
}) {
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(initial);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Close on outside click so the dropdown doesn't sit over the rest of the form.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/constituents/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setHits(data.results ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, open]);

  if (chosen) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
        <input type="hidden" name={name} value={chosen.id} />
        <span style={chip}>{chosen.name}</span>
        <button
          type="button"
          onClick={() => { setChosen(null); setQuery(""); setHits(null); }}
          title="Unlink constituent"
          style={{ background: "none", border: "none", color: "#9b1c1c", cursor: "pointer", fontSize: ".8rem" }}
        >
          clear
        </button>
      </div>
    );
  }

  return (
    <div ref={box} style={{ position: "relative", minWidth: 200 }}>
      <input type="hidden" name={name} value="" />
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={input}
        autoComplete="off"
      />
      {open && (
        <div style={dropdown}>
          {loading && hits === null && <div style={note}>Searching…</div>}
          {hits && hits.length === 0 && <div style={note}>No matches.</div>}
          {hits?.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => { setChosen({ id: h.id, name: h.name }); setOpen(false); }}
              style={row}
            >
              <span>{h.name}</span>
              {h.email && <span style={{ color: "#999", fontSize: ".78rem" }}>{h.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 8,
  fontSize: ".9rem", background: "#fff", width: "100%", boxSizing: "border-box",
};
const chip: React.CSSProperties = {
  fontSize: ".85rem", background: "var(--parchment-deep)", border: "1px solid var(--app-border)",
  borderRadius: 999, padding: ".25rem .65rem", whiteSpace: "nowrap",
};
const dropdown: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 20,
  background: "#fff", border: "1px solid var(--app-border)", borderRadius: 8,
  boxShadow: "0 6px 20px rgba(0,0,0,.09)", maxHeight: 240, overflowY: "auto",
};
const row: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem",
  width: "100%", textAlign: "left", padding: ".45rem .6rem", background: "none",
  border: "none", cursor: "pointer", fontSize: ".88rem",
};
const note: React.CSSProperties = { padding: ".5rem .6rem", color: "#999", fontSize: ".85rem" };
