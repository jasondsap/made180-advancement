"use client";

import { useState, type CSSProperties } from "react";

type FundOption = { id: string; name: string };

/** SMS composer. Body-only with a segment counter; STOP footer is added at send. */
export function SmsComposer({
  messageId,
  defaults,
  funds,
  saveDraftAction,
  sendNowAction,
}: {
  messageId?: string;
  defaults?: { name?: string; body?: string };
  funds: FundOption[];
  saveDraftAction: (fd: FormData) => void | Promise<void>;
  sendNowAction: (fd: FormData) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"all" | "fund">("all");
  const [body, setBody] = useState(defaults?.body ?? "");
  const len = body.length + 20; // approx + STOP footer
  const segments = Math.max(1, Math.ceil(len / 153));

  return (
    <form style={{ display: "grid", gap: "1rem", maxWidth: 620 }}>
      {messageId && <input type="hidden" name="id" value={messageId} />}

      <Field label="Internal name (not sent)">
        <input name="name" defaultValue={defaults?.name ?? ""} style={inp} placeholder="Event reminder" required />
      </Field>

      <Field label="Message — supports merge tags like {{contact.first_name}}">
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} style={{ ...inp, minHeight: 120 }} maxLength={1000} placeholder="Hi {{contact.first_name}}, a quick reminder..." required />
      </Field>
      <p style={{ fontSize: ".78rem", color: "#888", margin: "-.5rem 0 0" }}>
        {body.length} chars · ~{segments} segment{segments === 1 ? "" : "s"} · “Reply STOP to opt out.” is appended automatically.
      </p>

      <fieldset style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: "1rem", display: "grid", gap: ".6rem" }}>
        <legend style={{ fontWeight: 600, fontSize: ".85rem", padding: "0 .4rem" }}>Audience</legend>
        <label style={radio}><input type="radio" name="audienceMode" value="all" checked={mode === "all"} onChange={() => setMode("all")} /> All SMS-opted-in donors</label>
        <label style={radio}><input type="radio" name="audienceMode" value="fund" checked={mode === "fund"} onChange={() => setMode("fund")} /> Donors to a specific fund</label>
        {mode === "fund" && (
          <select name="fundId" style={inp}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <p style={{ fontSize: ".78rem", color: "#888", margin: 0 }}>
          Only contacts who have opted in to SMS and have a phone number receive texts. Do-not-contact is always excluded.
        </p>
      </fieldset>

      <div style={{ display: "flex", gap: ".6rem" }}>
        <button type="submit" formAction={saveDraftAction} style={btnGhost}>Save draft</button>
        <button
          type="submit"
          formAction={sendNowAction}
          onClick={(e) => { if (!confirm("Send this text to the selected audience now?")) e.preventDefault(); }}
          style={btnPrimary}
        >
          Send now
        </button>
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
