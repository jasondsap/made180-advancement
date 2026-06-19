import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/repositories/orgs";
import { listFunds } from "@/repositories/funds";
import { getAppealById } from "@/repositories/appeals";
import { DonationForm } from "./DonationForm";

/**
 * Public donation page — no auth. The org is resolved from the URL slug (the
 * trusted source of org identity on this route).
 */
export default async function GivePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ appeal?: string }>;
}) {
  const { orgSlug } = await params;
  const { appeal: appealParam } = await searchParams;
  const org = await getOrgBySlug(orgSlug);
  if (!org) notFound();

  const funds = await listFunds(org.id, { activeOnly: true });
  const donationsEnabled = Boolean(org.stripe_account_id);

  // Optional appeal attribution from a tracking link.
  const appeal = appealParam ? await getAppealById(org.id, appealParam) : undefined;

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 560,
        margin: "0 auto",
        padding: "2rem 1.25rem 4rem",
        color: "#1a1a1a",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 .25rem" }}>
          Donate to {org.legal_name}
        </h1>
        <p style={{ color: "#666", margin: 0 }}>
          Your gift is tax-deductible. A receipt will be emailed to you.
        </p>
      </header>

      {!donationsEnabled && (
        <div
          role="alert"
          style={{
            background: "#fff4e5",
            border: "1px solid #ffcc80",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1.5rem",
            color: "#7a4f00",
          }}
        >
          Online donations for {org.legal_name} aren’t enabled yet. Please check
          back soon.
        </div>
      )}

      <DonationForm
        orgSlug={org.slug}
        funds={funds.map((f) => ({ code: f.code, name: f.name }))}
        donationsEnabled={donationsEnabled}
        appealId={appeal?.id ?? null}
        appealName={appeal?.name ?? null}
      />

      <p style={{ color: "#999", fontSize: ".8rem", marginTop: "2rem", textAlign: "center" }}>
        Secure payment processed by Stripe. We never store your card details.
      </p>
    </main>
  );
}
