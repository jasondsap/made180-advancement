import { ArchMark } from "@/components/ArchMark";

export default function HomePage() {
  return (
    <main style={{ fontFamily: "var(--font-ui)", padding: "4rem 3rem", maxWidth: 680, color: "var(--ink)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".7rem", marginBottom: "1.5rem" }}>
        <ArchMark height={44} />
        <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", fontWeight: 600 }}>Almonry</span>
      </div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2.2rem", margin: "0 0 .5rem" }}>
        Where generosity is kept.
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "1.1rem", color: "var(--ink-soft)" }}>
        Donor management, online giving, and donor stewardship for community nonprofits.
      </p>
      <p style={{ color: "var(--ink-soft)", marginTop: "1.5rem" }}>
        Public giving lives at <code>/give/&lt;orgSlug&gt;</code>; the Cognito-protected admin
        app lives at <code>/app</code>.
      </p>
    </main>
  );
}
