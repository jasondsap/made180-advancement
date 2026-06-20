"use client";

import { useState, type CSSProperties } from "react";

type Step = "type" | "features" | "title";
type FType = "donation_form" | "fundraising_page" | "event";
type Feat = "peer_to_peer" | "auction";

const TYPES: { id: FType; label: string; desc: string; flag?: "events" }[] = [
  { id: "donation_form", label: "Donation form", desc: "The simplest way to collect one-time or recurring gifts. Suggested amounts, a goal bar, and a designation. Embed anywhere." },
  { id: "fundraising_page", label: "Fundraising page", desc: "A richer page to tell your story, show a cover image, and rally supporters with a live goal." },
  { id: "event", label: "Event", desc: "In-person, hybrid, or virtual events with tickets and registration.", flag: "events" },
];

const FEATURES: { id: Feat; label: string; desc: string; flag: "p2p" | "auction" }[] = [
  { id: "peer_to_peer", label: "Peer-to-peer", desc: "Let supporters fundraise on your behalf as individuals or teams.", flag: "p2p" },
  { id: "auction", label: "Auction", desc: "Run an online or in-person auction alongside your fundraiser.", flag: "auction" },
];

export function NewFundraiserWizard({
  flags,
  action,
}: {
  flags: { events: boolean; p2p: boolean; auction: boolean };
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<FType | null>(null);
  const [features, setFeatures] = useState<Feat[]>([]);
  const [title, setTitle] = useState("");

  const toggle = (f: Feat) => setFeatures((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  return (
    <div style={{ maxWidth: 560 }}>
      <Steps step={step} />

      {step === "type" && (
        <div style={{ display: "grid", gap: ".75rem" }}>
          <h2 style={h2}>Select a fundraiser type</h2>
          {TYPES.map((t) => {
            const locked = t.flag === "events" && !flags.events;
            const selected = type === t.id;
            return (
              <button key={t.id} type="button" disabled={locked} onClick={() => setType(t.id)} style={{ ...card, ...(selected ? cardSel : {}), opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer", textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>{t.label}{locked && <span style={{ fontSize: ".72rem", color: "#a06b1f", marginLeft: ".5rem" }}>Coming soon</span>}</div>
                <div style={{ fontSize: ".85rem", color: "var(--app-text-soft)", marginTop: ".25rem" }}>{t.desc}</div>
              </button>
            );
          })}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: ".5rem" }}>
            <button type="button" disabled={!type} onClick={() => setStep("features")} style={{ ...btnPrimary, opacity: type ? 1 : 0.5 }}>Continue</button>
          </div>
        </div>
      )}

      {step === "features" && (
        <div style={{ display: "grid", gap: ".75rem" }}>
          <h2 style={h2}>Add features (optional)</h2>
          {FEATURES.map((f) => {
            const locked = (f.flag === "p2p" && !flags.p2p) || (f.flag === "auction" && !flags.auction);
            const added = features.includes(f.id);
            return (
              <div key={f.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: locked ? 0.5 : 1 }}>
                <div style={{ paddingRight: "1rem" }}>
                  <div style={{ fontWeight: 600 }}>{f.label}{locked && <span style={{ fontSize: ".72rem", color: "#a06b1f", marginLeft: ".5rem" }}>Coming soon</span>}</div>
                  <div style={{ fontSize: ".85rem", color: "var(--app-text-soft)", marginTop: ".25rem" }}>{f.desc}</div>
                </div>
                <button type="button" disabled={locked} onClick={() => toggle(f.id)} style={added ? btnPrimary : btnGhost}>{added ? "✓ Added" : "Add"}</button>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: ".5rem" }}>
            <button type="button" onClick={() => setStep("type")} style={btnGhost}>‹ Back</button>
            <button type="button" onClick={() => setStep("title")} style={btnPrimary}>{features.length ? "Continue" : "Maybe later"}</button>
          </div>
        </div>
      )}

      {step === "title" && (
        <form action={action} style={{ display: "grid", gap: ".75rem" }}>
          <input type="hidden" name="type" value={type ?? "donation_form"} />
          <input type="hidden" name="features" value={features.join(",")} />
          <h2 style={h2}>Name your fundraiser</h2>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Spring Appeal 2026" style={inp} required />
          <p style={{ fontSize: ".82rem", color: "#888", margin: 0 }}>Don’t worry — you can change this later.</p>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: ".5rem" }}>
            <button type="button" onClick={() => setStep("features")} style={btnGhost}>‹ Back</button>
            <button type="submit" disabled={!title.trim()} style={{ ...btnPrimary, opacity: title.trim() ? 1 : 0.5 }}>Let’s go!</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const order: Step[] = ["type", "features", "title"];
  const idx = order.indexOf(step);
  return (
    <div style={{ display: "flex", gap: ".4rem", marginBottom: "1.25rem" }}>
      {order.map((s, i) => (
        <span key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= idx ? "var(--brand)" : "var(--app-border)" }} />
      ))}
    </div>
  );
}

const h2: CSSProperties = { fontSize: "1.2rem", margin: "0 0 .25rem" };
const card: CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "1rem", background: "#fff", width: "100%" };
const cardSel: CSSProperties = { borderColor: "var(--brand)", boxShadow: "0 0 0 1px var(--brand)" };
const inp: CSSProperties = { padding: ".6rem .7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: "1rem", width: "100%", boxSizing: "border-box" };
const btnPrimary: CSSProperties = { padding: ".5rem 1.1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: CSSProperties = { padding: ".5rem 1.1rem", borderRadius: 8, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
