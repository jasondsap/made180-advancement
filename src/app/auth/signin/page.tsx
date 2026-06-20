"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArchMark } from "@/components/ArchMark";

const OXBLOOD = "#6E2A2A";
const OXBLOOD_BRIGHT = "#8B3A36";
const BRASS = "#A9854B";
const BRASS_LIGHT = "#C8A86A";
const PARCHMENT = "#F2EBDC";
const INK = "#2B2620";
const FOREST = "#2F4032";

function SignInContent() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "var(--font-ui)" }}>
      {/* LEFT — form */}
      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", justifyContent: "center", padding: "2rem 3rem", background: "#fff", zIndex: 1 }}>
        <div style={{ maxWidth: 360, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".7rem", marginBottom: "2.25rem" }}>
            <ArchMark height={42} />
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 600, color: INK, letterSpacing: ".01em" }}>Almonry</span>
          </div>

          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.9rem", fontWeight: 500, color: INK, margin: "0 0 .4rem" }}>Welcome back</h1>
          <p style={{ color: "#6b6357", fontSize: ".95rem", margin: "0 0 1.75rem" }}>Sign in to your account to continue.</p>

          {error && (
            <div style={{ marginBottom: "1.25rem", padding: ".7rem .85rem", background: "#fbeceb", border: "1px solid #e6c3c0", borderRadius: 6, color: OXBLOOD, fontSize: ".88rem" }}>
              {error === "OAuthCallback" || error === "Callback"
                ? "Authentication failed. Please try again."
                : error === "AccessDenied"
                ? "Access denied."
                : "Sign-in error. Please try again."}
            </div>
          )}

          <button
            onClick={() => signIn("cognito", { callbackUrl: "/app" })}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: ".6rem", padding: ".9rem 1rem", background: OXBLOOD, color: PARCHMENT, border: "none", borderRadius: 3, fontWeight: 600, fontSize: "1rem", cursor: "pointer", letterSpacing: ".01em" }}
            onMouseOver={(e) => (e.currentTarget.style.background = OXBLOOD_BRIGHT)}
            onMouseOut={(e) => (e.currentTarget.style.background = OXBLOOD)}
          >
            Sign in with SSO
            <span aria-hidden style={{ fontSize: "1.1rem" }}>→</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginTop: "1.5rem", color: "#9b9388", fontSize: ".78rem", justifyContent: "center" }}>
            <span aria-hidden>🔒</span>
            <span>Secured by AWS Cognito</span>
          </div>

          <p style={{ textAlign: "center", color: "#c2bbac", fontSize: ".78rem", marginTop: "2.5rem" }}>
            © {new Date().getFullYear()} MADe180 Digital Solutions
          </p>
        </div>
      </div>

      {/* RIGHT — branded panel */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }} className="signin-hero">
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(150deg, ${FOREST} 0%, #3b2622 55%, ${OXBLOOD} 100%)` }} />
        <div style={{ position: "absolute", top: -120, right: -120, width: 360, height: 360, borderRadius: "50%", background: "rgba(169,133,75,.22)", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: -160, left: -80, width: 460, height: 460, borderRadius: "50%", background: "rgba(242,235,220,.10)", filter: "blur(70px)" }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4rem", maxWidth: 620 }}>
          <p style={{ color: BRASS_LIGHT, fontSize: ".78rem", fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", margin: "0 0 1.25rem" }}>
            Stewardship software
          </p>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "3rem", fontWeight: 400, color: PARCHMENT, lineHeight: 1.08, margin: "0 0 1.5rem", letterSpacing: "-.015em" }}>
            Where generosity<br />is <em style={{ fontStyle: "italic", color: BRASS_LIGHT }}>kept</em>.
          </h2>
          <p style={{ fontFamily: "var(--font-body)", color: "rgba(242,235,220,.78)", fontSize: "1.05rem", lineHeight: 1.6, maxWidth: 440 }}>
            Receive every gift. Remember every donor. Keep faith with both — from the first
            gift through receipts, recurring giving, and reporting.
          </p>

          <div style={{ display: "grid", gap: ".85rem", marginTop: "2.25rem" }}>
            {[
              "Online giving with instant tax receipts",
              "Recurring donations & pledge tracking",
              "Funds, campaigns & donor-lapse reporting",
              "QuickBooks export & AI-assisted insights",
            ].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: ".6rem" }}>
                <span style={{ color: BRASS_LIGHT, fontWeight: 700 }} aria-hidden>✓</span>
                <span style={{ color: "rgba(242,235,220,.88)", fontSize: ".92rem" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 900px) { .signin-hero { display: none !important; } }`}</style>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#fff" }} />}>
      <SignInContent />
    </Suspense>
  );
}
