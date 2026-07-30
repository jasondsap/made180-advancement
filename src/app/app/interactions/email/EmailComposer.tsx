"use client";

import { useRef, useState, type CSSProperties } from "react";
import { CanvaInsertImageButton } from "@/components/canva/CanvaInsertImageButton";

type SenderOption = { id: string; label: string };
type FundOption = { id: string; name: string };
type SegmentOption = { id: string; name: string };

/**
 * Email composer. One form, three submit actions (Save draft / Send now /
 * Schedule) via formAction. Consent filtering is automatic at send, so the
 * audience picker only chooses the base set (everyone / fund donors / a saved
 * segment).
 */
export function EmailComposer({
  messageId,
  defaults,
  senders,
  funds,
  segments = [],
  saveDraftAction,
  sendNowAction,
  scheduleAction,
  canvaEnabled = false,
  canvaConnected = false,
}: {
  messageId?: string;
  defaults?: { name?: string; subject?: string; body?: string; senderId?: string | null };
  senders: SenderOption[];
  funds: FundOption[];
  segments?: SegmentOption[];
  saveDraftAction: (fd: FormData) => void | Promise<void>;
  sendNowAction: (fd: FormData) => void | Promise<void>;
  scheduleAction?: (fd: FormData) => void | Promise<void>;
  canvaEnabled?: boolean;
  canvaConnected?: boolean;
}) {
  const [mode, setMode] = useState<"all" | "fund" | "segment">("all");
  const [showSchedule, setShowSchedule] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const scheduleRef = useRef<HTMLInputElement>(null);
  const scheduleIsoRef = useRef<HTMLInputElement>(null);
  const canSend = senders.length > 0;

  // Insert markdown at the cursor; textarea stays uncontrolled.
  function insertAtCursor(md: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    ta.setRangeText(`\n${md}\n`, ta.selectionStart, ta.selectionEnd, "end");
    ta.focus();
  }

  // datetime-local needs a local-time string; default one hour out.
  const defaultSchedule = (() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  return (
    <form style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      {messageId && <input type="hidden" name="id" value={messageId} />}

      <Field label="Internal name (not shown to donors)">
        <input name="name" defaultValue={defaults?.name ?? ""} style={inp} placeholder="June newsletter" required />
      </Field>

      <Field label="From sender">
        <select name="senderId" defaultValue={defaults?.senderId ?? ""} style={inp}>
          <option value="">{senders.length ? "Default sender" : "No senders configured"}</option>
          {senders.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>

      <Field label="Subject">
        <input name="subject" defaultValue={defaults?.subject ?? ""} style={inp} placeholder="A note of thanks" required />
      </Field>

      <Field label="Body — use **bold**, ![alt](image-url), and merge tags like {{contact.first_name}}">
        {(canvaEnabled || undefined) && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <CanvaInsertImageButton
              targetId={messageId ?? null}
              canvaEnabled={canvaEnabled}
              canvaConnected={canvaConnected}
              onInsert={insertAtCursor}
            />
          </div>
        )}
        <textarea ref={bodyRef} name="body" defaultValue={defaults?.body ?? ""} style={{ ...inp, minHeight: 200, fontFamily: "var(--font-body)" }} placeholder={"Dear {{contact.first_name}},\n\nThank you for your support..."} required />
      </Field>

      <fieldset style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: "1rem", display: "grid", gap: ".6rem" }}>
        <legend style={{ fontWeight: 600, fontSize: ".85rem", padding: "0 .4rem" }}>Audience</legend>
        <label style={radio}><input type="radio" name="audienceMode" value="all" checked={mode === "all"} onChange={() => setMode("all")} /> All reachable donors</label>
        <label style={radio}><input type="radio" name="audienceMode" value="fund" checked={mode === "fund"} onChange={() => setMode("fund")} /> Donors to a specific fund</label>
        {mode === "fund" && (
          <select name="fundId" style={inp}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        {segments.length > 0 && (
          <label style={radio}><input type="radio" name="audienceMode" value="segment" checked={mode === "segment"} onChange={() => setMode("segment")} /> A saved segment</label>
        )}
        {mode === "segment" && (
          <select name="segmentId" style={inp}>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <p style={{ fontSize: ".78rem", color: "#888", margin: 0 }}>
          Contacts who are marked do-not-contact, have no email, or have unsubscribed are always excluded.
        </p>
      </fieldset>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" formAction={saveDraftAction} style={btnGhost}>Save draft</button>
        <button
          type="submit"
          formAction={sendNowAction}
          disabled={!canSend}
          title={canSend ? "" : "Add a sender first"}
          onClick={(e) => { if (!confirm("Send this email to the selected audience now?")) e.preventDefault(); }}
          style={{ ...btnPrimary, opacity: canSend ? 1 : 0.5 }}
        >
          Send now
        </button>
        {scheduleAction && !showSchedule && (
          <button type="button" onClick={() => setShowSchedule(true)} disabled={!canSend} style={{ ...btnGhost, opacity: canSend ? 1 : 0.5 }}>
            Send later…
          </button>
        )}
        {scheduleAction && showSchedule && (
          <span style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            {/* datetime-local is timezone-naive; convert to ISO (UTC) at submit
                so the server schedules in the admin's local time. */}
            <input ref={scheduleRef} type="datetime-local" defaultValue={defaultSchedule} style={{ ...inp, width: "auto" }} required />
            <input ref={scheduleIsoRef} type="hidden" name="scheduledAt" />
            <button
              type="submit"
              formAction={scheduleAction}
              onClick={() => {
                const v = scheduleRef.current?.value;
                if (v && scheduleIsoRef.current) scheduleIsoRef.current.value = new Date(v).toISOString();
              }}
              style={btnPrimary}
            >
              Schedule
            </button>
          </span>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".3rem", fontSize: ".85rem", color: "#555" }}>{label}{children}</label>;
}
const inp: CSSProperties = { padding: ".6rem .7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".95rem", width: "100%", boxSizing: "border-box", background: "#fff" };
const radio: CSSProperties = { display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".92rem" };
const btnPrimary: CSSProperties = { padding: ".6rem 1.2rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: CSSProperties = { padding: ".6rem 1.2rem", borderRadius: 8, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" };
