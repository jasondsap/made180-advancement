"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { estimatedFeeCents, grossUpForFees } from "@/domain/fees";

type Frequency = "one_time" | "monthly";
type FundOption = { code: string; name: string };

const AMOUNT_CHIPS = [2500, 5000, 10000, 25000, 100000]; // cents

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

export function DonationForm({
  orgSlug,
  funds,
  donationsEnabled,
  appealId,
  appealName,
  fundraiserSlug,
}: {
  orgSlug: string;
  funds: FundOption[];
  donationsEnabled: boolean;
  appealId?: string | null;
  appealName?: string | null;
  /** When set, the designation is pinned by the fundraiser; the fund picker is hidden. */
  fundraiserSlug?: string | null;
}) {
  const [frequency, setFrequency] = useState<Frequency>("monthly"); // monthly pre-selected (spec)
  const [fundCode, setFundCode] = useState<string>(funds[0]?.code ?? "general");
  const [chip, setChip] = useState<number | null>(5000);
  const [customAmount, setCustomAmount] = useState<string>("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [zip, setZip] = useState("");

  const [showTribute, setShowTribute] = useState(false);
  const [tributeType, setTributeType] = useState<"in_honor" | "in_memory">("in_honor");
  const [tributeName, setTributeName] = useState("");
  const [employer, setEmployer] = useState("");
  const [coverFees, setCoverFees] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = useMemo(() => {
    if (chip !== null) return chip;
    const parsed = Math.round(parseFloat(customAmount) * 100);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [chip, customAmount]);

  const chargeCents = coverFees ? grossUpForFees(amountCents) : amountCents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amountCents < 100) {
      setError("Please choose or enter an amount of at least $1.00.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email so we can send your receipt.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          fundCode,
          fundraiserSlug: fundraiserSlug ?? undefined,
          frequency,
          amountCents,
          donor: {
            firstName,
            lastName,
            email,
            address: { line1, line2, city, state: stateRegion, zip, country: "US" },
          },
          tributeType: showTribute ? tributeType : null,
          tributeName: showTribute ? tributeName : null,
          employer: employer || null,
          coverFees,
          appealId: appealId ?? null,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.assign(data.url); // redirect to Stripe-hosted checkout
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-disabled={!donationsEnabled}>
      {appealName && (
        <p style={{ background: "#eef4f0", border: "1px solid #cfe0d6", color: "var(--brand)", borderRadius: 8, padding: ".5rem .75rem", fontSize: ".85rem", margin: "0 0 1rem" }}>
          Giving in response to: <strong>{appealName}</strong>
        </p>
      )}
      {/* Frequency */}
      <Fieldset legend="Frequency">
        <div style={styles.segment}>
          <SegBtn active={frequency === "monthly"} onClick={() => setFrequency("monthly")}>
            Monthly
            <span style={styles.badge}>Recommended</span>
          </SegBtn>
          <SegBtn active={frequency === "one_time"} onClick={() => setFrequency("one_time")}>
            One-time
          </SegBtn>
        </div>
      </Fieldset>

      {/* Fund — hidden when a fundraiser pins the designation */}
      {!fundraiserSlug && (
        <Fieldset legend="Designation">
          <select
            value={fundCode}
            onChange={(e) => setFundCode(e.target.value)}
            style={styles.input}
            aria-label="Fund designation"
          >
            {funds.map((f) => (
              <option key={f.code} value={f.code}>
                {f.name}
              </option>
            ))}
          </select>
        </Fieldset>
      )}

      {/* Amount */}
      <Fieldset legend="Amount">
        <div style={styles.chips}>
          {AMOUNT_CHIPS.map((c) => (
            <SegBtn key={c} active={chip === c} onClick={() => { setChip(c); setCustomAmount(""); }}>
              {usd(c)}
            </SegBtn>
          ))}
        </div>
        <div style={{ position: "relative", marginTop: ".5rem" }}>
          <span style={styles.dollarSign}>$</span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            placeholder="Other amount"
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); setChip(null); }}
            onFocus={() => setChip(null)}
            style={{ ...styles.input, paddingLeft: "1.6rem" }}
            aria-label="Custom amount in dollars"
          />
        </div>
      </Fieldset>

      {/* Donor */}
      <Fieldset legend="Your information">
        <div style={styles.row2}>
          <input style={styles.input} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <input style={styles.input} placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </div>
        <input style={styles.input} type="email" required placeholder="Email (for your receipt)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input style={styles.input} placeholder="Street address" value={line1} onChange={(e) => setLine1(e.target.value)} autoComplete="address-line1" />
        <input style={styles.input} placeholder="Apt, suite (optional)" value={line2} onChange={(e) => setLine2(e.target.value)} autoComplete="address-line2" />
        <div style={styles.row3}>
          <input style={styles.input} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          <input style={styles.input} placeholder="State" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} autoComplete="address-level1" />
          <input style={styles.input} placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" />
        </div>
        <p style={styles.hint}>Address is used for your tax receipt.</p>
      </Fieldset>

      {/* Optional */}
      <Fieldset legend="Optional">
        <label style={styles.checkRow}>
          <input type="checkbox" checked={showTribute} onChange={(e) => setShowTribute(e.target.checked)} />
          <span>Dedicate this gift (in honor / in memory)</span>
        </label>
        {showTribute && (
          <div style={{ marginTop: ".5rem" }}>
            <div style={styles.segment}>
              <SegBtn active={tributeType === "in_honor"} onClick={() => setTributeType("in_honor")}>In honor of</SegBtn>
              <SegBtn active={tributeType === "in_memory"} onClick={() => setTributeType("in_memory")}>In memory of</SegBtn>
            </div>
            <input style={{ ...styles.input, marginTop: ".5rem" }} placeholder="Honoree name" value={tributeName} onChange={(e) => setTributeName(e.target.value)} />
          </div>
        )}
        <input style={{ ...styles.input, marginTop: ".75rem" }} placeholder="Employer (for matching gifts)" value={employer} onChange={(e) => setEmployer(e.target.value)} />
        <label style={{ ...styles.checkRow, marginTop: ".75rem" }}>
          <input type="checkbox" checked={coverFees} onChange={(e) => setCoverFees(e.target.checked)} />
          <span>
            Cover the processing fee{amountCents > 0 ? ` (+${usd(estimatedFeeCents(amountCents))})` : ""} so 100% of my gift goes to the cause
          </span>
        </label>
      </Fieldset>

      {error && <p style={styles.error} role="alert">{error}</p>}

      <button type="submit" disabled={!donationsEnabled || submitting || amountCents < 100} style={styles.submit}>
        {submitting
          ? "Redirecting to secure checkout…"
          : `Donate ${chargeCents > 0 ? usd(chargeCents) : ""}${frequency === "monthly" ? "/mo" : ""}`}
      </button>
    </form>
  );
}

// ---- small presentational helpers ----

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset style={styles.fieldset}>
      <legend style={styles.legend}>{legend}</legend>
      {children}
    </fieldset>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...styles.segBtn,
        ...(active ? styles.segBtnActive : {}),
      }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  fieldset: { border: "none", padding: 0, margin: "0 0 1.25rem" },
  legend: { fontWeight: 600, fontSize: ".85rem", textTransform: "uppercase", letterSpacing: ".04em", color: "#555", padding: 0, marginBottom: ".5rem" },
  input: { width: "100%", boxSizing: "border-box", padding: ".7rem .8rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 8, marginBottom: ".5rem", background: "#fff" },
  segment: { display: "flex", gap: ".5rem" },
  chips: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: ".5rem" },
  segBtn: { flex: 1, padding: ".7rem .6rem", fontSize: ".95rem", border: "1px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: ".4rem" },
  segBtnActive: { borderColor: "var(--brand)", background: "#edf1ec", color: "var(--brand)", fontWeight: 600 },
  badge: { fontSize: ".65rem", background: "var(--brand)", color: "#fff", borderRadius: 999, padding: "1px 6px" },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" },
  row3: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: ".5rem" },
  checkRow: { display: "flex", gap: ".5rem", alignItems: "flex-start", fontSize: ".95rem", lineHeight: 1.35, cursor: "pointer" },
  dollarSign: { position: "absolute", left: ".8rem", top: ".7rem", color: "#666" },
  hint: { fontSize: ".8rem", color: "#888", margin: ".1rem 0 0" },
  error: { color: "#b00020", fontSize: ".9rem", margin: "0 0 .75rem" },
  submit: { width: "100%", padding: "0.9rem", fontSize: "1.05rem", fontWeight: 600, color: "#fff", background: "var(--brand)", border: "none", borderRadius: 10, cursor: "pointer" },
};
