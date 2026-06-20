"use client";

import { useState, type CSSProperties } from "react";

type FundOption = { id: string; name: string };

/** Letter composer for printable mailings. Save as draft, or generate the merged PDF. */
export function MailingComposer({
  messageId,
  defaults,
  funds,
  saveDraftAction,
  generateAction,
}: {
  messageId?: string;
  defaults?: { name?: string; body?: string };
  funds: FundOption[];
  saveDraftAction: (fd: FormData) => void | Promise<void>;
  generateAction: (fd: FormData) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"all" | "fund">("all");

  return (
    <form style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      {messageId && <input type="hidden" name="id" value={messageId} />}

      <Field label="Internal name">
        <input name="name" defaultValue={defaults?.name ?? ""} style={inp} placeholder="Year-end appeal letter" required />
      </Field>

      <Field label="Letter body — supports merge tags like {{contact.first_name}}">
        <textarea name="body" defaultValue={defaults?.body ?? ""} style={{ ...inp, minHeight: 240, fontFamily: "var(--font-body)" }} placeholder={"Dear {{contact.first_name}},\n\nThank you for being part of our work this year...\n"} required />
      </Field>
      <p style={{ fontSize: ".78rem", color: "#888", margin: "-.5rem 0 0" }}>
        Each letter is generated with your organization letterhead, the recipient’s address block, and your signatory.
      </p>

      <fieldset style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: "1rem", display: "grid", gap: ".6rem" }}>
        <legend style={{ fontWeight: 600, fontSize: ".85rem", padding: "0 .4rem" }}>Recipients</legend>
        <label style={radio}><input type="radio" name="audienceMode" value="all" checked={mode === "all"} onChange={() => setMode("all")} /> All donors with a mailing address</label>
        <label style={radio}><input type="radio" name="audienceMode" value="fund" checked={mode === "fund"} onChange={() => setMode("fund")} /> Donors to a specific fund</label>
        {mode === "fund" && (
          <select name="fundId" style={inp}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <p style={{ fontSize: ".78rem", color: "#888", margin: 0 }}>Contacts without a mailing address, or marked do-not-contact, are excluded.</p>
      </fieldset>

      <div style={{ display: "flex", gap: ".6rem" }}>
        <button type="submit" formAction={saveDraftAction} style={btnGhost}>Save draft</button>
        <button type="submit" formAction={generateAction} style={btnPrimary}>Generate letters</button>
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
