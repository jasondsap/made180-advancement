export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 640 }}>
      <h1>MADe180 Advancement Platform</h1>
      <p>Multi-tenant nonprofit donor CRM + donation processing.</p>
      <p style={{ color: "#666" }}>
        Scaffold in place. Public giving lives at <code>/give/&lt;orgSlug&gt;</code>; the
        Cognito-protected admin app lives at <code>/app</code>.
      </p>
    </main>
  );
}
