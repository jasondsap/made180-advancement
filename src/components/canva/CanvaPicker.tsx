"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DesignItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

/**
 * Modal design picker: lists/searches the connected user's Canva designs,
 * exports the chosen one (202-continuation aware), and hands back the stable
 * S3 URL + media id.
 */
export function CanvaPicker({
  targetKind,
  targetId,
  onPlaced,
  onClose,
}: {
  targetKind: string;
  targetId?: string | null;
  onPlaced: (r: { url: string; mediaId: string }) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<DesignItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [notConnected, setNotConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null); // designId being exported
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/canva/designs${q ? `?query=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      if (data.error === "not_connected") {
        setNotConnected(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "load failed");
      setItems(data.items);
    } catch {
      setError("Could not load your Canva designs. Please try again.");
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  function onSearch(q: string) {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(q), 350);
  }

  async function pick(design: DesignItem) {
    setExporting(design.id);
    setError(null);
    try {
      let jobId: string | undefined;
      const startedAt = Date.now();
      // Export with 202 continuation — server polls ≤15s per call, we keep
      // re-POSTing (with jobId) up to ~90s total.
      for (;;) {
        const res = await fetch("/api/canva/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designId: design.id, targetKind, targetId: targetId ?? null, jobId }),
        });
        const data = await res.json();
        if (data.error === "not_connected") {
          setNotConnected(true);
          return;
        }
        if (res.status === 202 && data.jobId) {
          jobId = data.jobId;
          if (Date.now() - startedAt > 90_000) throw new Error("export timed out");
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (!res.ok || !data.url) throw new Error(data.error ?? "export failed");
        onPlaced({ url: data.url, mediaId: data.mediaId });
        return;
      }
    } catch {
      setError("Export from Canva failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Choose a Canva design">
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".8rem" }}>
          <strong style={{ fontSize: "1.02rem", flex: 1 }}>Choose a Canva design</strong>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>

        {notConnected ? (
          <p style={{ fontSize: ".9rem", color: "#555" }}>
            Your Canva account isn&apos;t connected.{" "}
            <a href="/app/settings" style={{ color: "var(--brand)" }}>Connect Canva in Settings</a>, then come back.
          </p>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search your designs…"
              style={{ width: "100%", boxSizing: "border-box", padding: ".55rem .7rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".9rem", marginBottom: ".8rem" }}
            />
            {error && <p style={{ color: "#9b1c1c", fontSize: ".85rem" }}>{error}</p>}
            {items === null && !error && <p style={{ color: "#999", fontSize: ".88rem" }}>Loading designs…</p>}
            {items?.length === 0 && (
              <p style={{ color: "#999", fontSize: ".88rem" }}>
                No designs found. Create one at <a href="https://www.canva.com" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>canva.com</a> and it will appear here.
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: ".7rem", maxHeight: 380, overflowY: "auto" }}>
              {items?.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pick(d)}
                  disabled={exporting !== null}
                  style={{ border: "1px solid #e2e4e2", borderRadius: 8, background: "#fff", padding: 0, cursor: exporting ? "wait" : "pointer", overflow: "hidden", textAlign: "left", opacity: exporting && exporting !== d.id ? 0.5 : 1 }}
                >
                  <div style={{ height: 96, background: "#f4f4f2", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {d.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ color: "#bbb", fontSize: ".8rem" }}>No preview</span>
                    )}
                  </div>
                  <div style={{ padding: ".45rem .55rem", fontSize: ".8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {exporting === d.id ? "Exporting…" : d.title}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,14,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" };
const modal: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: "1rem 1.1rem", width: "min(680px, 100%)", boxShadow: "0 12px 40px rgba(0,0,0,.18)" };
const closeBtn: React.CSSProperties = { border: "none", background: "transparent", fontSize: "1rem", cursor: "pointer", color: "#888" };
