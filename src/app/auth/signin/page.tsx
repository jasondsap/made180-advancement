"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const NVRE_GREEN = "#1c6e3c";
const NVRE_DARK = "#0f3d22";
const NVRE_ACCENT = "#7fd1a0";

function SignInContent() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* LEFT — form */}
      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", justifyContent: "center", padding: "2rem 3rem", background: "#fff", zIndex: 1 }}>
        <div style={{ maxWidth: 360, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: "2rem" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${NVRE_GREEN}, ${NVRE_DARK})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>N</span>
            </div>
            <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1a2b1f" }}>NVRE Advancement</span>
          </div>

          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#1a2b1f", margin: "0 0 .35rem" }}>Welcome back</h1>
          <p style={{ color: "#6b7280", fontSize: ".95rem", margin: "0 0 1.75rem" }}>Sign in to your account to continue.</p>

          {error && (
            <div style={{ marginBottom: "1.25rem", padding: ".7rem .85rem", background: "#fdecec", border: "1px solid #f3c5c5", borderRadius: 10, color: "#9b1c1c", fontSize: ".88rem" }}>
              {error === "OAuthCallback" || error === "Callback"
                ? "Authentication failed. Please try again."
                : error === "AccessDenied"
                ? "Access denied."
                : "Sign-in error. Please try again."}
            </div>
          )}

          <button
            onClick={() => signIn("cognito", { callbackUrl: "/app" })}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: ".6rem", padding: ".85rem 1rem", background: NVRE_GREEN, color: "#fff", border: "none", borderRadius: 12, fontWeight: 600, fontSize: "1rem", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}
          >
            Sign in with SSO
            <span aria-hidden style={{ fontSize: "1.1rem" }}>→</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginTop: "1.5rem", color: "#9ca3af", fontSize: ".78rem", justifyContent: "center" }}>
            <span aria-hidden>🔒</span>
            <span>Secured by AWS Cognito</span>
          </div>

          <p style={{ textAlign: "center", color: "#cbd2cd", fontSize: ".78rem", marginTop: "2.5rem" }}>
            © {new Date().getFullYear()} MADe180 Digital Solutions
          </p>
        </div>
      </div>

      {/* RIGHT — branded panel */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }} className="signin-hero">
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${NVRE_DARK} 0%, ${NVRE_GREEN} 70%, #2f8f54 100%)` }} />
        <div style={{ position: "absolute", top: -120, right: -120, width: 360, height: 360, borderRadius: "50%", background: "rgba(127,209,160,.18)", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: -160, left: -80, width: 460, height: 460, borderRadius: "50%", background: "rgba(255,255,255,.08)", filter: "blur(70px)" }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4rem", maxWidth: 620 }}>
          <p style={{ color: NVRE_ACCENT, fontSize: ".8rem", fontWeight: 600, letterSpacing: ".15em", textTransform: "uppercase", margin: "0 0 1rem" }}>
            Advancement Platform
          </p>
          <h2 style={{ fontSize: "2.6rem", fontWeight: 700, color: "#fff", lineHeight: 1.15, margin: "0 0 1.25rem" }}>
            Every gift,<br />tracked with care.<br />
            <span style={{ color: NVRE_ACCENT }}>Every donor, valued.</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,.75)", fontSize: "1rem", lineHeight: 1.6, maxWidth: 440 }}>
            Donor CRM and donation processing for New Vision Renewable Energy — from
            the first gift through receipts, recurring giving, and reporting.
          </p>

          <div style={{ display: "grid", gap: ".85rem", marginTop: "2.25rem" }}>
            {[
              "Online giving with instant tax receipts",
              "Recurring donations & pledge tracking",
              "Funds, campaigns & donor-lapse reporting",
              "QuickBooks export & AI-assisted insights",
            ].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: ".6rem" }}>
                <span style={{ color: NVRE_ACCENT, fontWeight: 700 }} aria-hidden>✓</span>
                <span style={{ color: "rgba(255,255,255,.85)", fontSize: ".92rem" }}>{f}</span>
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
