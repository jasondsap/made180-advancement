import Link from "next/link";
import { getOrgBySlug } from "@/repositories/orgs";
import { getStripe } from "@/lib/stripe";

/**
 * Post-checkout confirmation. The gift itself is logged by the webhook (the
 * source of truth) — this page is purely a friendly acknowledgment and does NOT
 * write anything. We optionally retrieve the session to echo the amount.
 */
export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { orgSlug } = await params;
  const { session_id } = await searchParams;
  const org = await getOrgBySlug(orgSlug);

  let amountText = "";
  let donorEmail = "";
  if (session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      if (session.amount_total) {
        amountText = (session.amount_total / 100).toLocaleString("en-US", {
          style: "currency",
          currency: (session.currency ?? "usd").toUpperCase(),
        });
      }
      donorEmail = session.customer_details?.email ?? "";
    } catch {
      // Non-fatal — show the generic message.
    }
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 560,
        margin: "0 auto",
        padding: "4rem 1.25rem",
        textAlign: "center",
        color: "#1a1a1a",
      }}
    >
      <div style={{ fontSize: "3rem" }}>🌱</div>
      <h1 style={{ fontSize: "1.6rem", margin: ".5rem 0" }}>Thank you for your gift!</h1>
      <p style={{ color: "#444", lineHeight: 1.5 }}>
        {amountText ? <>Your {amountText} donation to </> : <>Your donation to </>}
        <strong>{org?.legal_name ?? "the organization"}</strong> has been received.
        {donorEmail ? <> A tax receipt is on its way to {donorEmail}.</> : <> A tax receipt will be emailed to you shortly.</>}
      </p>
      <p style={{ marginTop: "2rem" }}>
        <Link href={`/give/${orgSlug}`} style={{ color: "#1c6e3c" }}>
          Make another gift
        </Link>
      </p>
    </main>
  );
}
