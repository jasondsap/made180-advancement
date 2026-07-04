"use client";

import { useState } from "react";
import { parseCsv, parseMoneyToCents, parseDateToIso } from "@/lib/csv";
import {
  importConstituentsBatchAction,
  previewConstituentsAction,
  importGiftsBatchAction,
  previewGiftsAction,
  type ConstituentImportResult,
  type GiftImportResult,
} from "./actions";

type ImportType = "constituents" | "gifts";
const BATCH = 250;

/** Field definitions + header auto-guess patterns (checked in order). */
const CONSTITUENT_FIELDS: Array<{ key: string; label: string; guess: RegExp; required?: boolean }> = [
  { key: "email", label: "Email", guess: /e-?mail/i },
  { key: "firstName", label: "First name", guess: /^first|first\s*name|fname/i },
  { key: "lastName", label: "Last name", guess: /^last|last\s*name|lname|surname/i },
  { key: "orgName", label: "Organization name", guess: /org|company|business/i },
  { key: "phone", label: "Phone", guess: /phone|mobile|cell/i },
  { key: "line1", label: "Address line 1", guess: /add?r(ess)?\s*(line\s*)?1?$|street/i },
  { key: "line2", label: "Address line 2", guess: /add?r(ess)?\s*(line\s*)?2/i },
  { key: "city", label: "City", guess: /city|town/i },
  { key: "state", label: "State", guess: /state|province/i },
  { key: "zip", label: "ZIP", guess: /zip|postal/i },
  { key: "type", label: "Record type (individual/org)", guess: /record\s*type|^type$/i },
  { key: "doNotContact", label: "Do not contact (yes/no)", guess: /do\s*not\s*contact|dnc/i },
  { key: "emailOptOut", label: "Email opt-out (yes/no)", guess: /opt.?out|unsubscribe|do\s*not\s*email/i },
  { key: "smsOptIn", label: "SMS opt-in (yes/no)", guess: /sms|text\s*opt/i },
];

const GIFT_FIELDS: Array<{ key: string; label: string; guess: RegExp; required?: boolean }> = [
  { key: "donorEmail", label: "Donor email", guess: /e-?mail/i, required: true },
  { key: "amount", label: "Amount", guess: /amount|total/i, required: true },
  { key: "date", label: "Gift date", guess: /date|received/i, required: true },
  { key: "donorFirst", label: "Donor first name", guess: /first/i },
  { key: "donorLast", label: "Donor last name", guess: /last|surname/i },
  { key: "fundKey", label: "Fund (code or name)", guess: /fund/i },
  { key: "campaignName", label: "Campaign", guess: /campaign/i },
  { key: "giftType", label: "Gift type", guess: /gift\s*type|payment\s*(type|method)/i },
  { key: "externalRef", label: "External gift ID (dedupe key)", guess: /gift\s*(id|number|no)|external|reference/i },
  { key: "notes", label: "Notes", guess: /note|memo|comment/i },
  { key: "isAnonymous", label: "Anonymous (yes/no)", guess: /anon/i },
];

const truthy = (v: string) => /^(true|yes|y|1|x|checked)$/i.test(v.trim());

export default function ImportWizard() {
  const [type, setType] = useState<ImportType>("constituents");
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [clientErrors, setClientErrors] = useState<Array<{ rowNum: number; error: string }>>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [serverErrors, setServerErrors] = useState<Array<{ rowNum: number; error: string }>>([]);
  const [fatal, setFatal] = useState("");

  const fields = type === "constituents" ? CONSTITUENT_FIELDS : GIFT_FIELDS;

  function onFile(f: File) {
    setFatal("");
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      if (parsed.length < 2) {
        setFatal("That file has no data rows (need a header row plus at least one record).");
        return;
      }
      const hdr = parsed[0]!.map((h) => h.trim());
      setFileName(f.name);
      setHeaders(hdr);
      setRows(parsed.slice(1));
      // Auto-guess: first header matching each field's pattern, unclaimed columns only.
      const m: Record<string, number> = {};
      const claimed = new Set<number>();
      for (const field of fields) {
        const idx = hdr.findIndex((h, i) => !claimed.has(i) && field.guess.test(h));
        if (idx >= 0) {
          m[field.key] = idx;
          claimed.add(idx);
        }
      }
      setMapping(m);
      setStep(2);
    };
    reader.readAsText(f);
  }

  const cell = (row: string[], key: string): string => {
    const idx = mapping[key];
    return idx !== undefined && idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  function mapConstituentRow(row: string[]) {
    const typeRaw = cell(row, "type").toLowerCase();
    return {
      type: (typeRaw.includes("org") ? "organization" : "individual") as "individual" | "organization",
      firstName: cell(row, "firstName") || null,
      lastName: cell(row, "lastName") || null,
      orgName: cell(row, "orgName") || null,
      email: cell(row, "email") || null,
      phone: cell(row, "phone") || null,
      line1: cell(row, "line1") || null,
      line2: cell(row, "line2") || null,
      city: cell(row, "city") || null,
      state: cell(row, "state") || null,
      zip: cell(row, "zip") || null,
      doNotContact: truthy(cell(row, "doNotContact")),
      emailOptOut: truthy(cell(row, "emailOptOut")),
      smsOptIn: truthy(cell(row, "smsOptIn")),
    };
  }

  function mapGiftRows() {
    const good: Array<Record<string, unknown>> = [];
    const bad: Array<{ rowNum: number; error: string }> = [];
    rows.forEach((row, i) => {
      const rowNum = i + 2; // 1-based + header
      const email = cell(row, "donorEmail");
      const amountCents = parseMoneyToCents(cell(row, "amount"));
      const dateIso = parseDateToIso(cell(row, "date"));
      if (!email) return bad.push({ rowNum, error: "Missing donor email" });
      if (!amountCents) return bad.push({ rowNum, error: `Unreadable amount "${cell(row, "amount")}"` });
      if (!dateIso) return bad.push({ rowNum, error: `Unreadable date "${cell(row, "date")}"` });
      good.push({
        rowNum,
        donorEmail: email,
        donorFirst: cell(row, "donorFirst") || null,
        donorLast: cell(row, "donorLast") || null,
        amountCents,
        dateIso,
        fundKey: cell(row, "fundKey") || null,
        campaignName: cell(row, "campaignName") || null,
        giftType: cell(row, "giftType") || null,
        externalRef: cell(row, "externalRef") || null,
        notes: cell(row, "notes") || null,
        isAnonymous: truthy(cell(row, "isAnonymous")),
      });
    });
    return { good, bad };
  }

  async function runPreview() {
    setBusy(true);
    setFatal("");
    try {
      if (type === "constituents") {
        const emails = rows.map((r) => cell(r, "email")).filter(Boolean);
        const p = await previewConstituentsAction(emails);
        setPreview({
          "Rows in file": rows.length,
          "With an email (deduped on import)": emails.length,
          "Already in Almonry (will be enriched, not duplicated)": p.existing,
          "Without an email (always created — don't re-import these)": rows.length - emails.length,
        });
        setClientErrors([]);
      } else {
        const { good, bad } = mapGiftRows();
        const p = await previewGiftsAction({
          emails: good.map((g) => g.donorEmail as string),
          refs: good.map((g) => g.externalRef as string | null).filter((x): x is string => !!x),
        });
        setPreview({
          "Rows in file": rows.length,
          "Ready to import": good.length,
          "Rows with problems (will be skipped)": bad.length,
          "Donors already in Almonry": p.knownDonors,
          "New donors (created on import)": p.unknownDonors,
          "Already imported (same gift ID — skipped)": p.alreadyImported,
        });
        setClientErrors(bad);
      }
      setStep(3);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    setFatal("");
    setProgress(0);
    setServerErrors([]);
    try {
      if (type === "constituents") {
        const mapped = rows.map(mapConstituentRow);
        const totals: ConstituentImportResult = { created: 0, updated: 0, createdNoEmail: 0, skipped: 0 };
        for (let i = 0; i < mapped.length; i += BATCH) {
          const r = await importConstituentsBatchAction(mapped.slice(i, i + BATCH));
          totals.created += r.created;
          totals.updated += r.updated;
          totals.createdNoEmail += r.createdNoEmail;
          totals.skipped += r.skipped;
          setProgress(Math.min(1, (i + BATCH) / mapped.length));
        }
        setResult({
          "New constituents created": totals.created,
          "Existing constituents enriched": totals.updated,
          "Created without email": totals.createdNoEmail,
          "Skipped (empty or duplicate-in-file)": totals.skipped,
        });
      } else {
        const { good, bad } = mapGiftRows();
        const totals: GiftImportResult = { created: 0, skippedDup: 0, unmatchedFund: 0, unmatchedCampaign: 0, errors: [] };
        for (let i = 0; i < good.length; i += BATCH) {
          const r = await importGiftsBatchAction(good.slice(i, i + BATCH));
          totals.created += r.created;
          totals.skippedDup += r.skippedDup;
          totals.unmatchedFund += r.unmatchedFund;
          totals.unmatchedCampaign += r.unmatchedCampaign;
          totals.errors.push(...r.errors);
          setProgress(Math.min(1, (i + BATCH) / good.length));
        }
        setResult({
          "Gifts imported": totals.created,
          "Skipped as duplicates": totals.skippedDup,
          "Imported without a matching fund": totals.unmatchedFund,
          "Imported without a matching campaign": totals.unmatchedCampaign,
          "Rows skipped for problems": bad.length + totals.errors.length,
        });
        setServerErrors([...bad, ...totals.errors]);
      }
      setStep(4);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Import failed — some batches may have been applied. Re-running is safe for rows with emails / gift IDs.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setClientErrors([]);
    setServerErrors([]);
    setProgress(0);
    setFatal("");
  }

  return (
    <div style={card}>
      {/* Step 1: type + file */}
      {step === 1 && (
        <div>
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem" }}>
            {(["constituents", "gifts"] as const).map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", gap: ".4rem", cursor: "pointer" }}>
                <input type="radio" name="importType" checked={type === t} onChange={() => setType(t)} />
                <span style={{ textTransform: "capitalize" }}>{t === "gifts" ? "Gift history" : t}</span>
              </label>
            ))}
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {type === "gifts" && (
            <p style={hint}>
              Each gift row needs a donor email, amount, and date. Map your source&apos;s gift ID to
              &quot;External gift ID&quot; so re-running the import never duplicates gifts.
            </p>
          )}
        </div>
      )}

      {/* Step 2: mapping */}
      {step === 2 && (
        <div>
          <p style={{ margin: "0 0 .75rem", fontSize: ".92rem" }}>
            <strong>{fileName}</strong> — {rows.length.toLocaleString()} rows. Match your columns:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: ".5rem .75rem" }}>
            {fields.map((f) => (
              <label key={f.key} style={{ fontSize: ".85rem", display: "flex", flexDirection: "column", gap: ".2rem" }}>
                <span>
                  {f.label}
                  {f.required && <span style={{ color: "#9b1c1c" }}> *</span>}
                </span>
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}
                  style={inp}
                >
                  <option value={-1}>— not in file —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h || `(column ${i + 1})`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {/* Sample */}
          <div style={{ overflowX: "auto", marginTop: "1rem" }}>
            <table style={{ borderCollapse: "collapse", fontSize: ".8rem" }}>
              <thead>
                <tr>{fields.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => <th key={f.key} style={tdh}>{f.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((r, i) => (
                  <tr key={i}>
                    {fields.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                      <td key={f.key} style={tdc}>{cell(r, f.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem" }}>
            <button onClick={reset} style={btnGhost}>Start over</button>
            <button
              onClick={runPreview}
              disabled={busy || fields.some((f) => f.required && (mapping[f.key] ?? -1) < 0)}
              style={btn}
            >
              {busy ? "Checking…" : "Preview import"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: preview */}
      {step === 3 && preview && (
        <div>
          <h2 style={h2}>Ready to import</h2>
          {Object.entries(preview).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: ".35rem 0", borderTop: "1px solid #f1f2f1", fontSize: ".9rem" }}>
              <span>{k}</span><strong>{v.toLocaleString()}</strong>
            </div>
          ))}
          {clientErrors.length > 0 && <ErrorList errors={clientErrors} />}
          <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem" }}>
            <button onClick={() => setStep(2)} style={btnGhost}>Back to mapping</button>
            <button onClick={runImport} disabled={busy} style={btn}>
              {busy ? `Importing… ${Math.round(progress * 100)}%` : "Import now"}
            </button>
          </div>
          {busy && (
            <div style={{ marginTop: ".75rem", height: 8, background: "#eee", borderRadius: 4 }}>
              <div style={{ width: `${progress * 100}%`, height: "100%", background: "var(--brand)", borderRadius: 4, transition: "width .3s" }} />
            </div>
          )}
        </div>
      )}

      {/* Step 4: summary */}
      {step === 4 && result && (
        <div>
          <h2 style={h2}>Import complete</h2>
          {Object.entries(result).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: ".35rem 0", borderTop: "1px solid #f1f2f1", fontSize: ".9rem" }}>
              <span>{k}</span><strong>{v.toLocaleString()}</strong>
            </div>
          ))}
          {serverErrors.length > 0 && <ErrorList errors={serverErrors} />}
          <button onClick={reset} style={{ ...btn, marginTop: "1rem" }}>Import another file</button>
        </div>
      )}

      {fatal && (
        <p style={{ background: "#fdecec", color: "#9b1c1c", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginTop: "1rem" }}>
          {fatal}
        </p>
      )}
    </div>
  );
}

function ErrorList({ errors }: { errors: Array<{ rowNum: number; error: string }> }) {
  return (
    <details style={{ marginTop: ".75rem", fontSize: ".85rem" }}>
      <summary style={{ cursor: "pointer", color: "#9b1c1c" }}>
        {errors.length.toLocaleString()} row{errors.length === 1 ? "" : "s"} skipped — details
      </summary>
      <ul style={{ margin: ".5rem 0 0", paddingLeft: "1.25rem", maxHeight: 200, overflowY: "auto" }}>
        {errors.slice(0, 200).map((e, i) => (
          <li key={i}>Row {e.rowNum}: {e.error}</li>
        ))}
        {errors.length > 200 && <li>…and {(errors.length - 200).toLocaleString()} more</li>}
      </ul>
    </details>
  );
}

const card: React.CSSProperties = { background: "var(--app-surface, #fff)", border: "1px solid var(--app-border, #e5e2da)", borderRadius: 10, padding: "1.25rem" };
const inp: React.CSSProperties = { padding: ".4rem .5rem", border: "1px solid #d9d5cc", borderRadius: 6, fontSize: ".85rem", background: "#fff" };
const btn: React.CSSProperties = { background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, padding: ".55rem 1rem", fontSize: ".9rem", cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "transparent", color: "var(--brand)", border: "1px solid var(--brand)", borderRadius: 6, padding: ".55rem 1rem", fontSize: ".9rem", cursor: "pointer" };
const h2: React.CSSProperties = { fontSize: "1.1rem", margin: "0 0 .75rem" };
const hint: React.CSSProperties = { fontSize: ".82rem", color: "#7a7367", marginTop: ".75rem" };
const tdh: React.CSSProperties = { textAlign: "left", padding: ".3rem .6rem", borderBottom: "2px solid #e5e2da", color: "#888", whiteSpace: "nowrap" };
const tdc: React.CSSProperties = { padding: ".3rem .6rem", borderBottom: "1px solid #f1f2f1", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" };
