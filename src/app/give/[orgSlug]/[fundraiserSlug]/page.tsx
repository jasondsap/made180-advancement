import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/repositories/orgs";
import { getPublishedFundraiser, getFundraiser } from "@/repositories/fundraisers";
import { getFundById, listFunds } from "@/repositories/funds";
import { listPublicTicketTypes } from "@/repositories/ticketTypes";
import { listMembers } from "@/repositories/p2pMembers";
import { listPublicItems } from "@/repositories/auctions";
import { DonationForm } from "../DonationForm";
import { EventRegistration } from "./EventRegistration";
import { P2PJoinForm } from "./P2PJoinForm";
import { AuctionItems } from "./AuctionItems";

/**
 * Public fundraiser page — a themed wrapper around the shared DonationForm. The
 * fundraiser pins the fund designation; gifts attribute to it via checkout. Org
 * + fundraiser are resolved from the URL slugs (the trusted source on this route).
 */
export default async function FundraiserPage({
  params,
}: {
  params: Promise<{ orgSlug: string; fundraiserSlug: string }>;
}) {
  const { orgSlug, fundraiserSlug } = await params;
  const org = await getOrgBySlug(orgSlug);
  if (!org) notFound();
  const fr = await getPublishedFundraiser(orgSlug, fundraiserSlug);
  if (!fr) notFound();

  const donationsEnabled = Boolean(org.stripe_account_id) && fr.payments_enabled;
  const isEvent = fr.type === "event";
  const fund = !isEvent && fr.fund_id ? await getFundById(org.id, fr.fund_id) : undefined;
  // Fallback fund list only matters if the fundraiser has no designated fund.
  const funds = isEvent
    ? []
    : fund
      ? [{ code: fund.code, name: fund.name }]
      : (await listFunds(org.id, { activeOnly: true })).map((f) => ({ code: f.code, name: f.name }));
  const ticketTypes = isEvent ? await listPublicTicketTypes(fr.id) : [];
  const hasP2P = fr.features.includes("peer_to_peer");
  const hasAuction = fr.features.includes("auction");
  const members = hasP2P ? await listMembers(org.id, fr.id) : [];
  const auctionItems = hasAuction ? await listPublicItems(fr.id) : [];
  const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const theme = fr.theme_json ?? {};
  const accent = theme.accent || org.primary_color || undefined;
  const brandStyle = accent ? ({ ["--brand" as string]: accent } as React.CSSProperties) : undefined;

  const stats = await getFundraiser(org.id, fr.id);
  const raisedCents = stats?.raised_cents ?? 0;

  return (
    <main style={{ fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 600, margin: "0 auto", padding: "2rem 1.25rem 4rem", color: "#1a1a1a", ...brandStyle }}>
      {theme.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.coverImageUrl} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 12, marginBottom: "1.25rem" }} />
      )}
      <header style={{ marginBottom: "1.25rem" }}>
        {org.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt={`${org.legal_name} logo`} style={{ maxHeight: 48, maxWidth: 180, marginBottom: ".6rem", objectFit: "contain" }} />
        )}
        <h1 style={{ fontSize: "1.8rem", margin: "0 0 .25rem" }}>{fr.title}</h1>
        <p style={{ color: "#666", margin: 0 }}>Supporting {org.legal_name}. Your gift is tax-deductible.</p>
      </header>

      {fr.goal_cents != null && <GoalBar raisedCents={raisedCents} goalCents={fr.goal_cents} />}

      {theme.story && (
        <div style={{ fontSize: "1rem", lineHeight: 1.6, color: "#333", margin: "0 0 1.5rem", whiteSpace: "pre-wrap" }}>{theme.story}</div>
      )}

      {!donationsEnabled && (
        <div role="alert" style={{ background: "#fff4e5", border: "1px solid #ffcc80", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem", color: "#7a4f00" }}>
          This fundraiser isn’t accepting online gifts right now. Please check back soon.
        </div>
      )}

      {isEvent ? (
        <EventRegistration
          orgSlug={org.slug}
          fundraiserSlug={fr.slug}
          enabled={donationsEnabled}
          tickets={ticketTypes.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            priceCents: t.price_cents,
            remaining: t.capacity != null ? Math.max(0, t.capacity - t.sold) : null,
          }))}
        />
      ) : (
        <DonationForm
          orgSlug={org.slug}
          funds={funds}
          donationsEnabled={donationsEnabled}
          fundraiserSlug={fr.slug}
          appealId={null}
          appealName={null}
        />
      )}

      {hasP2P && (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", margin: "0 0 .25rem" }}>Fundraisers</h2>
          <p style={{ color: "#666", fontSize: ".9rem", margin: "0 0 1rem" }}>Rally your friends — start your own page for this cause.</p>
          {members.length > 0 && (
            <div style={{ display: "grid", gap: ".5rem", marginBottom: "1rem" }}>
              {members.slice(0, 10).map((m) => (
                <a key={m.id} href={`/give/${org.slug}/${fr.slug}/p/${m.slug}`} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #e3ddd0", borderRadius: 10, padding: ".7rem .9rem", textDecoration: "none", color: "#222" }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span style={{ color: "var(--brand)" }}>{money(m.raised_cents)}{m.goal_cents ? ` / ${money(m.goal_cents)}` : ""}</span>
                </a>
              ))}
            </div>
          )}
          <P2PJoinForm orgSlug={org.slug} fundraiserSlug={fr.slug} />
        </section>
      )}

      {hasAuction && (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", margin: "0 0 1rem" }}>Auction</h2>
          <AuctionItems
            orgSlug={org.slug}
            fundraiserSlug={fr.slug}
            items={auctionItems.map((it) => ({
              id: it.id,
              name: it.name,
              description: it.description,
              imageUrl: it.image_url,
              status: it.status,
              startingBidCents: it.starting_bid_cents,
              minIncrementCents: it.min_increment_cents,
              highBidCents: it.high_bid_cents,
              bidCount: it.bid_count,
            }))}
          />
        </section>
      )}

      <p style={{ color: "#999", fontSize: ".8rem", marginTop: "2rem", textAlign: "center" }}>
        Secure payment processed by Stripe. We never store your card details.
      </p>
    </main>
  );
}

/** Goal progress bar — uses the live raised total for this fundraiser. */
function GoalBar({ raisedCents, goalCents }: { raisedCents: number; goalCents: number }) {
  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return (
    <div style={{ margin: "0 0 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".95rem", marginBottom: ".4rem" }}>
        <strong style={{ color: "var(--brand)", fontSize: "1.2rem" }}>{usd(raisedCents)}</strong>
        <span style={{ color: "#666" }}>of {usd(goalCents)} goal</span>
      </div>
      <div style={{ height: 10, background: "rgba(0,0,0,.08)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)" }} />
      </div>
      <div style={{ fontSize: ".82rem", color: "#888", marginTop: ".3rem" }}>{pct}% raised</div>
    </div>
  );
}
