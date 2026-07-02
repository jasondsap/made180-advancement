import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/repositories/orgs";
import { listFunds } from "@/repositories/funds";
import { getAppealById } from "@/repositories/appeals";
import { getCampaignByPublicSlug } from "@/repositories/campaigns";
import { campaignSummary, campaignDonorWall } from "@/repositories/campaignStats";
import { DonationForm } from "../../DonationForm";
import { AnimatedThermometer } from "./AnimatedThermometer";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * Public campaign page — no auth. Org resolved from the URL slug; campaign from
 * its public_slug (active campaigns only — unpublish by clearing the slug or
 * deactivating). Note: the static `c` segment wins over [fundraiserSlug], so a
 * fundraiser cannot be slugged literally "c".
 */
export default async function PublicCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campaignSlug: string }>;
  searchParams: Promise<{ appeal?: string }>;
}) {
  const { orgSlug, campaignSlug } = await params;
  const { appeal: appealParam } = await searchParams;
  const org = await getOrgBySlug(orgSlug);
  if (!org) notFound();
  const campaign = await getCampaignByPublicSlug(org.id, campaignSlug);
  if (!campaign) notFound();

  const [funds, summary, wall, appeal] = await Promise.all([
    listFunds(org.id, { activeOnly: true }),
    campaignSummary(org.id, campaign.id),
    campaignDonorWall(org.id, campaign.id, 24),
    appealParam ? getAppealById(org.id, appealParam) : Promise.resolve(undefined),
  ]);
  const donationsEnabled = Boolean(org.stripe_account_id);

  const brandStyle = org.primary_color
    ? ({ ["--brand" as string]: org.primary_color } as React.CSSProperties)
    : undefined;

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 1.25rem 4rem",
        color: "#1a1a1a",
        ...brandStyle,
      }}
    >
      {campaign.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={campaign.cover_image_url}
          alt=""
          style={{ width: "calc(100% + 2.5rem)", margin: "0 -1.25rem", maxHeight: 260, objectFit: "cover", display: "block" }}
        />
      )}

      <header style={{ margin: "2rem 0 1.5rem" }}>
        {org.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={org.logo_url}
            alt={`${org.legal_name} logo`}
            style={{ maxHeight: 56, maxWidth: 200, marginBottom: ".75rem", objectFit: "contain" }}
          />
        )}
        <h1 style={{ fontSize: "1.7rem", margin: "0 0 .3rem" }}>{campaign.name}</h1>
        <p style={{ color: "#666", margin: 0 }}>A campaign by {org.legal_name}</p>
      </header>

      <section style={{ marginBottom: "1.5rem" }}>
        <AnimatedThermometer
          raisedCents={summary.raisedCents}
          goalCents={campaign.goal_cents}
          donorCount={summary.donorCount}
        />
      </section>

      {campaign.description && (
        <p style={{ fontSize: "1rem", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: "1.75rem" }}>
          {campaign.description}
        </p>
      )}

      {!donationsEnabled && (
        <div
          role="alert"
          style={{ background: "#fff4e5", border: "1px solid #ffcc80", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem", color: "#7a4f00" }}
        >
          Online donations for {org.legal_name} aren’t enabled yet. Please check back soon.
        </div>
      )}

      <DonationForm
        orgSlug={org.slug}
        funds={funds.map((f) => ({ code: f.code, name: f.name }))}
        donationsEnabled={donationsEnabled}
        appealId={appeal?.id ?? null}
        appealName={appeal?.name ?? null}
        campaignSlug={campaign.public_slug}
      />

      {wall.length > 0 && (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 .75rem" }}>Recent supporters</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: ".4rem" }}>
            {wall.map((w, i) => (
              <li
                key={i}
                style={{ display: "flex", justifyContent: "space-between", background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: ".55rem .8rem", fontSize: ".92rem" }}
              >
                <span style={{ fontStyle: w.displayName === "Anonymous" ? "italic" : "normal" }}>{w.displayName}</span>
                <span style={{ fontWeight: 600 }}>{usd(w.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p style={{ color: "#999", fontSize: ".8rem", marginTop: "2rem", textAlign: "center" }}>
        Secure payment processed by Stripe. We never store your card details.
      </p>
    </main>
  );
}
