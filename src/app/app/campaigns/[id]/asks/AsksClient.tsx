"use client";

import { useState } from "react";
import { sendAppealAskAction } from "../../actions";

interface SegmentDef {
  key: string;
  label: string;
  description: string;
}

/**
 * The segmented-ask flow: pick a segment → see live counts → AI-draft the
 * appeal → edit → send. Sending creates the appeal + a Tidings email message
 * (consent-filtered) and substitutes {{appeal_link}} with the tracking link.
 */
export function AsksClient({ campaignId, segments }: { campaignId: string; segments: SegmentDef[] }) {
  const [segmentKey, setSegmentKey] = useState<string>("");
  const [preview, setPreview] = useState<{ total: number; reachable: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [appealName, setAppealName] = useState("");
  const [askAmount, setAskAmount] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickSegment(key: string) {
    setSegmentKey(key);
    setPreview(null);
    setError(null);
    setPreviewing(true);
    try {
      const res = await fetch("/api/campaigns/segment-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, segmentKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "preview failed");
      setPreview(data);
      const seg = segments.find((s) => s.key === key);
      if (seg && !appealName) setAppealName(seg.label.split("—")[0]!.trim() + " ask");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview segment.");
    } finally {
      setPreviewing(false);
    }
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const cents = parseFloat(askAmount);
      const res = await fetch("/api/assistant/appeal-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          segmentKey,
          askAmountCents: Number.isFinite(cents) ? Math.round(cents * 100) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "draft failed");
      setSubject(data.subject);
      setBody(data.bodyMd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft.");
    } finally {
      setDrafting(false);
    }
  }

  const selected = segments.find((s) => s.key === segmentKey);
  const canSend = segmentKey && appealName.trim() && subject.trim() && body.trim() && (preview?.reachable ?? 0) > 0;

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      {/* Step 1 — segment */}
      <section style={card}>
        <h2 style={h2}>1 · Who are you asking?</h2>
        <div style={{ display: "grid", gap: ".4rem" }}>
          {segments.map((s) => (
            <label key={s.key} style={{ display: "flex", gap: ".55rem", alignItems: "baseline", fontSize: ".9rem", cursor: "pointer" }}>
              <input type="radio" name="segment" checked={segmentKey === s.key} onChange={() => pickSegment(s.key)} />
              <span>
                <strong>{s.label}</strong>
                <span style={{ color: "#888", display: "block", fontSize: ".8rem" }}>{s.description}</span>
              </span>
            </label>
          ))}
        </div>
        {previewing && <p style={muted}>Counting…</p>}
        {preview && (
          <p style={{ ...muted, color: preview.reachable ? "#2F4032" : "#9b1c1c", fontWeight: 600 }}>
            {preview.total} constituent{preview.total === 1 ? "" : "s"} matched · {preview.reachable} reachable by email (consent-filtered)
          </p>
        )}
      </section>

      {/* Step 2 — draft */}
      <section style={card}>
        <h2 style={h2}>2 · Draft the appeal</h2>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input value={appealName} onChange={(e) => setAppealName(e.target.value)} placeholder="Appeal name (internal)" style={{ ...inp, flex: 1, minWidth: 180 }} />
          <input value={askAmount} onChange={(e) => setAskAmount(e.target.value)} placeholder="Suggested ask $ (optional)" style={{ ...inp, width: 180 }} inputMode="decimal" />
          <button type="button" onClick={draft} disabled={!segmentKey || drafting} style={{ ...btnPrimary, opacity: !segmentKey || drafting ? 0.6 : 1 }}>
            {drafting ? "Drafting…" : body ? "Draft again" : "✦ Draft with AI"}
          </button>
        </div>
        {selected && !body && !drafting && (
          <p style={muted}>Claude drafts in your org&apos;s voice for “{selected.description}”. You can edit everything before sending.</p>
        )}
        <div style={{ display: "grid", gap: ".5rem", marginTop: ".7rem" }}>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={inp} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="Body — or click Draft with AI" style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          <p style={muted}>
            <code>{"{{contact.first_name}}"}</code> personalizes each email · <code>{"{{appeal_link}}"}</code> becomes your tracking link when sent, so every gift attributes back to this appeal.
          </p>
        </div>
      </section>

      {/* Step 3 — send */}
      <section style={card}>
        <h2 style={h2}>3 · Send</h2>
        <form
          action={sendAppealAskAction}
          onSubmit={(e) => {
            if (!window.confirm(`Send this appeal to ${preview?.reachable ?? 0} recipient(s)? This cannot be undone.`)) {
              e.preventDefault();
              return;
            }
            setSending(true);
          }}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="segmentKey" value={segmentKey} />
          <input type="hidden" name="appealName" value={appealName} />
          <input type="hidden" name="askAmount" value={askAmount} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
          <p style={{ ...muted, marginTop: 0 }}>
            Sends now through Tidings from your default sender. Consent (unsubscribes, do-not-contact) is applied automatically, every email carries your postal footer + unsubscribe link, and each send is logged on the constituent&apos;s timeline.
          </p>
          <button type="submit" disabled={!canSend || sending} style={{ ...btnPrimary, opacity: !canSend || sending ? 0.6 : 1 }}>
            {sending ? "Sending…" : `Send to ${preview?.reachable ?? 0} recipient${(preview?.reachable ?? 0) === 1 ? "" : "s"}`}
          </button>
        </form>
      </section>

      {error && <p style={{ color: "#9b1c1c", fontSize: ".88rem" }}>{error}</p>}
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" };
const h2: React.CSSProperties = { fontSize: "1rem", margin: "0 0 .7rem" };
const muted: React.CSSProperties = { color: "#999", fontSize: ".82rem", margin: ".5rem 0 0" };
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 6, fontSize: ".9rem" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
