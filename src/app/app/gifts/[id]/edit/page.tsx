import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { getGiftById } from "@/repositories/gifts";
import { getConstituentById } from "@/repositories/constituents";
import { listFunds } from "@/repositories/funds";
import { listCampaigns } from "@/repositories/campaigns";
import { listAppeals } from "@/repositories/appeals";
import { updateGiftAction } from "../../actions";

export const dynamic = "force-dynamic";

const MANUAL_TYPES = ["one_time", "check", "cash", "in_kind", "matching", "stock", "pledge", "recurring"];

/**
 * Gift edit. Attribution is always editable; amount/date/type only for gifts
 * without a Stripe payment behind them (those fields are locked to the charge).
 */
export default async function GiftEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) return <p style={{ color: "#999" }}>Editing gifts requires an admin role.</p>;
  const { id } = await params;
  const { error } = await searchParams;

  const gift = await getGiftById(ctx.orgId, id);
  if (!gift) notFound();

  const [funds, campaigns, appeals, softCredit] = await Promise.all([
    listFunds(ctx.orgId),
    listCampaigns(ctx.orgId),
    listAppeals(ctx.orgId),
    gift.soft_credit_id ? getConstituentById(ctx.orgId, gift.soft_credit_id) : Promise.resolve(undefined),
  ]);

  const stripeLocked = Boolean(gift.stripe_payment_intent_id);
  const receivedDefault = gift.received_at ? new Date(gift.received_at).toISOString().slice(0, 10) : "";

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href={`/app/gifts/${id}`} style={{ color: "var(--brand)", textDecoration: "none", fontSize: ".9rem" }}>← Gift</Link>
      <h1 style={{ fontSize: "1.4rem", margin: ".75rem 0 1rem" }}>Edit gift</h1>
      {error && <p style={{ background: "#fdecec", color: "#9b1c1c", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem" }}>{error}</p>}
      {stripeLocked && (
        <p style={{ background: "#fff4e5", color: "#7a4f00", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".85rem" }}>
          This gift is backed by a Stripe payment — the amount, date, and type mirror the charge and
          can&apos;t be edited. Attribution below is fully editable.
        </p>
      )}

      <form action={updateGiftAction} style={{ display: "grid", gap: ".9rem" }}>
        <input type="hidden" name="giftId" value={gift.id} />

        {!stripeLocked && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: ".6rem" }}>
            <Field label="Amount ($)">
              <input name="amount" type="number" min="0.01" step="0.01" defaultValue={(gift.amount_cents / 100).toFixed(2)} style={inp} />
            </Field>
            <Field label="Date received">
              <input name="receivedAt" type="date" defaultValue={receivedDefault} style={inp} />
            </Field>
            <Field label="Type">
              <select name="giftType" defaultValue={gift.gift_type} style={inp}>
                {MANUAL_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </Field>
          </div>
        )}

        <Field label="Fund">
          <select name="fundId" defaultValue={gift.fund_id ?? ""} style={inp}>
            <option value="">— none —</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Campaign">
          <select name="campaignId" defaultValue={gift.campaign_id ?? ""} style={inp}>
            <option value="">— none —</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Appeal">
          <select name="appealId" defaultValue={gift.appeal_id ?? ""} style={inp}>
            <option value="">— none —</option>
            {appeals.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Soft credit (constituent email or ID — credits them without double-counting)">
          <input name="softCredit" defaultValue={softCredit?.email ?? gift.soft_credit_id ?? ""} placeholder="person@example.org" style={inp} />
        </Field>
        <label style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".92rem" }}>
          <input type="checkbox" name="isAnonymous" defaultChecked={gift.is_anonymous} />
          Anonymous — hide from donor walls and public reports
        </label>
        <Field label="Notes">
          <textarea name="notes" defaultValue={gift.notes ?? ""} style={{ ...inp, minHeight: 70 }} />
        </Field>

        <div><button type="submit" style={btn}>Save changes</button></div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: ".25rem", fontSize: ".85rem", color: "#555" }}>{label}{children}</label>;
}
const inp: React.CSSProperties = { padding: ".55rem .65rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".95rem", width: "100%", boxSizing: "border-box", background: "#fff" };
const btn: React.CSSProperties = { padding: ".6rem 1.2rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".95rem", fontWeight: 600, cursor: "pointer" };
