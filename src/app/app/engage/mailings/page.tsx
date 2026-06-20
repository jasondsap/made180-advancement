import { flags } from "@/lib/featureFlags";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default function MailingsPage() {
  if (!flags().engageMailings) {
    return (
      <div style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "3rem", background: "#fff" }}>
        <EmptyState
          icon="✉"
          title="Printed mailings"
          description="Generate merged letters for your donors — appeal letters, year-end summaries, acknowledgments. Coming soon: printable PDFs first, with optional print-and-mail fulfillment later."
        />
      </div>
    );
  }
  return <p style={{ color: "#999" }}>Mailings composer coming in a later slice.</p>;
}
