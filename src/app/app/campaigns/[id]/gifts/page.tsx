import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getCampaignById } from "@/repositories/campaigns";
import { listAppealsForCampaign } from "@/repositories/appeals";
import { listGiftsFiltered, countGiftsFiltered } from "@/repositories/gifts";
import { campaignSummary } from "@/repositories/campaignStats";
import { usd, fmtNumber, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampaignHeader } from "../../CampaignHeader";

const PAGE_SIZE = 50;

export default async function CampaignGiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ appeal?: string; page?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { appeal, page: pageRaw } = await searchParams;
  const campaign = await getCampaignById(ctx.orgId, id);
  if (!campaign) notFound();

  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const filters = {
    campaignId: campaign.id,
    appealId: appeal || null,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const [summary, appeals, gifts, total] = await Promise.all([
    campaignSummary(ctx.orgId, campaign.id),
    listAppealsForCampaign(ctx.orgId, campaign.id),
    listGiftsFiltered(ctx.orgId, filters),
    countGiftsFiltered(ctx.orgId, filters),
  ]);
  const appealName = new Map(appeals.map((a) => [a.id, a.name]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseHref = `/app/campaigns/${campaign.id}/gifts`;

  return (
    <div>
      <CampaignHeader campaign={campaign} raisedCents={summary.raisedCents} active="gifts" />

      {appeals.length > 0 && (
        <nav style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: ".8rem" }}>
          <FilterLink href={baseHref} on={!appeal} label="All appeals" />
          {appeals.map((a) => (
            <FilterLink key={a.id} href={`${baseHref}?appeal=${a.id}`} on={appeal === a.id} label={a.name} />
          ))}
        </nav>
      )}

      <section style={card}>
        {gifts.length === 0 ? (
          <EmptyState title="No gifts yet" description="Gifts attributed to this campaign (via checkout, appeals, fundraisers, or manual entry) appear here." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#888", borderBottom: "1px solid #eee" }}>
                <th style={th}>Date</th>
                <th style={th}>Donor</th>
                <th style={th}>Appeal</th>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {gifts.map((g) => {
                const donor =
                  [g.donor_first, g.donor_last].filter(Boolean).join(" ") || g.donor_org || g.donor_email || "Unknown";
                return (
                  <tr key={g.id} style={{ borderBottom: "1px solid #f3f4f3" }}>
                    <td style={td}>{fmtDate(g.received_at)}</td>
                    <td style={td}>
                      <Link href={`/app/gifts/${g.id}`} style={{ color: "inherit" }}>{donor}</Link>
                      {g.is_anonymous && <span style={{ marginLeft: ".4rem" }}><Badge tone="neutral">Anon</Badge></span>}
                    </td>
                    <td style={td}>{g.appeal_id ? appealName.get(g.appeal_id) ?? "—" : "—"}</td>
                    <td style={td}>{g.gift_type.replace("_", " ")}</td>
                    <td style={td}>
                      <Badge tone={g.status === "succeeded" ? "success" : g.status === "refunded" ? "danger" : "warning"}>{g.status}</Badge>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{usd(g.amount_cents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {pages > 1 && (
        <nav style={{ display: "flex", gap: ".4rem", marginTop: ".8rem", alignItems: "center", fontSize: ".85rem" }}>
          {page > 1 && <Link href={`${baseHref}?${appeal ? `appeal=${appeal}&` : ""}page=${page - 1}`}>← Prev</Link>}
          <span style={{ color: "#888" }}>Page {page} of {pages} · {fmtNumber(total)} gifts</span>
          {page < pages && <Link href={`${baseHref}?${appeal ? `appeal=${appeal}&` : ""}page=${page + 1}`}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}

function FilterLink({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: ".82rem", padding: ".3rem .6rem", borderRadius: 6, textDecoration: "none",
        border: "1px solid", borderColor: on ? "var(--brand)" : "#d8dad8",
        background: on ? "#edf1ec" : "#fff",
        color: on ? "var(--brand)" : "#444",
      }}
    >
      {label}
    </Link>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" };
const th: React.CSSProperties = { padding: ".4rem .5rem" };
const td: React.CSSProperties = { padding: ".5rem .5rem" };
