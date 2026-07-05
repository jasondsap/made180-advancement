import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/repositories/orgs";
import { listFunds } from "@/repositories/funds";
import { getAppealById } from "@/repositories/appeals";
import { DonationForm } from "../../give/[orgSlug]/DonationForm";

/**
 * Embeddable donation widget — the giving form with no page chrome, sized for
 * an iframe on the org's own website. Checkout still redirects to Stripe's
 * hosted page (it breaks out of the frame via the checkout link's top-level
 * navigation, which Stripe handles). Copyable snippet lives in Settings.
 */
export default async function EmbedPage({
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
  const appeal = appealParam ? await getAppealById(org.id, appealParam) : undefined;

  const brandStyle = org.primary_color
    ? ({ ["--brand" as string]: org.primary_color } as React.CSSProperties)
    : undefined;

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 480,
        margin: "0 auto",
        padding: "1rem",
        color: "#1a1a1a",
        background: "#fff",
        ...brandStyle,
      }}
    >
      {!donationsEnabled && (
        <div role="alert" style={{ background: "#fff4e5", border: "1px solid #ffcc80", borderRadius: 8, padding: "1rem", marginBottom: "1rem", color: "#7a4f00" }}>
          Online donations aren&apos;t enabled yet.
        </div>
      )}
      <DonationForm
        orgSlug={org.slug}
        funds={funds.map((f) => ({ code: f.code, name: f.name }))}
        donationsEnabled={donationsEnabled}
        appealId={appeal?.id ?? null}
        appealName={appeal?.name ?? null}
      />
      <p style={{ color: "#999", fontSize: ".75rem", marginTop: "1rem", textAlign: "center" }}>
        Secure payment by Stripe · Receipt emailed to you
      </p>
    </main>
  );
}
