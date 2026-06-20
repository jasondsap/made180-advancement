import { flags } from "@/lib/featureFlags";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default function TextsPage() {
  if (!flags().engageSms) {
    return (
      <div style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "3rem", background: "#fff" }}>
        <EmptyState
          icon="💬"
          title="Reach donors by text"
          description="SMS lets you send quick, high-open-rate updates and appeals. Texting is coming soon — it requires a connected Twilio number and per-contact opt-in (TCPA)."
        />
        <ul style={{ maxWidth: 420, margin: "1.5rem auto 0", color: "var(--app-text-soft)", fontSize: ".9rem", lineHeight: 1.7 }}>
          <li>Opt-in capture + automatic STOP/HELP handling</li>
          <li>Delivery tracking per recipient</li>
          <li>Same audience builder as email</li>
        </ul>
      </div>
    );
  }
  return <p style={{ color: "#999" }}>SMS composer coming in the next slice.</p>;
}
