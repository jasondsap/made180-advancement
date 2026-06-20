import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrgBySlug } from "@/repositories/orgs";
import { getPublishedFundraiser } from "@/repositories/fundraisers";
import { getFundById, listFunds } from "@/repositories/funds";
import { getMemberBySlug, getMemberWithRaised } from "@/repositories/p2pMembers";
import { DonationForm } from "../../../DonationForm";

/**
 * Peer-to-peer member page. A supporter's personal page under a fundraiser:
 * their goal + story, with donations credited to both them and the fundraiser.
 */
export default async function MemberPage({
  params,
}: {
  params: Promise<{ orgSlug: string; fundraiserSlug: string; memberSlug: string }>;
}) {
  const { orgSlug, fundraiserSlug, memberSlug } = await params;
  const org = await getOrgBySlug(orgSlug);
  if (!org) notFound();
  const fr = await getPublishedFundraiser(orgSlug, fundraiserSlug);
  if (!fr) notFound();
  const member = await getMemberBySlug(fr.id, memberSlug);
  if (!member) notFound();

  const stats = await getMemberWithRaised(org.id, member.id);
  const raisedCents = stats?.raised_cents ?? 0;
  const donationsEnabled = Boolean(org.stripe_account_id) && fr.payments_enabled;
  const fund = fr.fund_id ? await getFundById(org.id, fr.fund_id) : undefined;
  const funds = fund ? [{ code: fund.code, name: fund.name }] : (await listFunds(org.id, { activeOnly: true })).map((f) => ({ code: f.code, name: f.name }));

  const theme = fr.theme_json ?? {};
  const accent = theme.accent || org.primary_color || undefined;
  const brandStyle = accent ? ({ ["--brand" as string]: accent } as React.CSSProperties) : undefined;
  const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const pct = member.goal_cents && member.goal_cents > 0 ? Math.min(100, Math.round((raisedCents / member.goal_cents) * 100)) : 0;

  return (
    <main style={{ fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 600, margin: "0 auto", padding: "2rem 1.25rem 4rem", color: "#1a1a1a", ...brandStyle }}>
      <p style={{ fontSize: ".85rem", margin: "0 0 1rem" }}>
        <Link href={`/give/${org.slug}/${fr.slug}`} style={{ color: "var(--brand)" }}>← {fr.title}</Link>
      </p>
      <header style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: ".8rem", color: "#888", margin: 0, textTransform: "uppercase", letterSpacing: ".06em" }}>Fundraising for {org.legal_name}</p>
        <h1 style={{ fontSize: "1.8rem", margin: ".25rem 0 0" }}>{member.name}</h1>
      </header>

      {member.goal_cents != null && (
        <div style={{ margin: "0 0 1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".95rem", marginBottom: ".4rem" }}>
            <strong style={{ color: "var(--brand)", fontSize: "1.2rem" }}>{money(raisedCents)}</strong>
            <span style={{ color: "#666" }}>of {money(member.goal_cents)} goal</span>
          </div>
          <div style={{ height: 10, background: "rgba(0,0,0,.08)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)" }} />
          </div>
        </div>
      )}

      {member.message && <div style={{ fontSize: "1rem", lineHeight: 1.6, color: "#333", margin: "0 0 1.5rem", whiteSpace: "pre-wrap" }}>{member.message}</div>}

      <DonationForm
        orgSlug={org.slug}
        funds={funds}
        donationsEnabled={donationsEnabled}
        fundraiserSlug={fr.slug}
        p2pMemberSlug={member.slug}
        appealId={null}
        appealName={null}
      />

      <p style={{ color: "#999", fontSize: ".8rem", marginTop: "2rem", textAlign: "center" }}>
        Secure payment processed by Stripe. We never store your card details.
      </p>
    </main>
  );
}
