import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { getGiftById } from "@/repositories/gifts";
import { getConstituentById } from "@/repositories/constituents";
import { getFundById } from "@/repositories/funds";
import { usd, fmtDate } from "@/lib/format";
import { refundGift, resendReceipt } from "../actions";
import { ThankYouButton } from "./ThankYouButton";

const MSGS: Record<string, [string, string, string]> = {
  created: ["#e8f5ec", "#1c6e3c", "Gift recorded."],
  refunded: ["#e8f5ec", "#1c6e3c", "Gift refunded."],
  already_refunded: ["#fff4e5", "#7a4f00", "This gift was already refunded."],
  refund_error: ["#fdecec", "#9b1c1c", "Refund failed — check Stripe and try again."],
  receipt_sent: ["#e8f5ec", "#1c6e3c", "Receipt sent."],
  receipt_error: ["#fdecec", "#9b1c1c", "Receipt could not be sent (check email config)."],
};

export default async function GiftDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { msg } = await searchParams;

  const gift = await getGiftById(ctx.orgId, id);
  if (!gift) notFound();

  const [constituent, fund] = await Promise.all([
    getConstituentById(ctx.orgId, gift.constituent_id),
    gift.fund_id ? getFundById(ctx.orgId, gift.fund_id) : Promise.resolve(undefined),
  ]);

  const donor = constituent
    ? [constituent.first_name, constituent.last_name].filter(Boolean).join(" ") || constituent.org_name || constituent.email || "—"
    : "—";
  const banner = msg ? MSGS[msg] : undefined;

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href="/app/gifts" style={{ color: "#1c6e3c", textDecoration: "none", fontSize: ".9rem" }}>← Gifts</Link>

      {banner && (
        <div style={{ background: banner[0], color: banner[1], padding: ".7rem .9rem", borderRadius: 8, margin: ".75rem 0", fontSize: ".9rem" }}>
          {banner[2]}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: ".75rem", flexWrap: "wrap", gap: ".5rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>{usd(gift.amount_cents)}</h1>
        <span style={{ color: "#666" }}>{gift.gift_type} · {gift.status}</span>
      </div>

      <section style={card}>
        <Row k="Donor" v={constituent ? <Link href={`/app/constituents/${constituent.id}`} style={{ color: "#1c6e3c" }}>{donor}</Link> : donor} />
        <Row k="Email" v={constituent?.email ?? "—"} />
        <Row k="Fund" v={fund?.name ?? "—"} />
        <Row k="Received" v={fmtDate(gift.received_at)} />
        <Row k="Currency" v={gift.currency.toUpperCase()} />
        {gift.fee_cents != null && <Row k="Processing fee" v={usd(gift.fee_cents)} />}
        {gift.net_cents != null && <Row k="Net" v={usd(gift.net_cents)} />}
        {gift.tribute_type && <Row k={gift.tribute_type === "in_memory" ? "In memory of" : "In honor of"} v={gift.tribute_name ?? "—"} />}
        {gift.notes && <Row k="Notes" v={gift.notes} />}
      </section>

      <section style={card}>
        <Row k="Receipt #" v={gift.receipt_number ?? "— not issued —"} />
        <Row k="Receipt sent" v={gift.receipt_sent_at ? fmtDate(gift.receipt_sent_at) : "—"} />
      </section>

      {(gift.stripe_payment_intent_id || gift.stripe_subscription_id || gift.stripe_invoice_id || gift.card_last4) && (
        <section style={card}>
          {gift.stripe_payment_intent_id && <Row k="PaymentIntent" v={<code>{gift.stripe_payment_intent_id}</code>} />}
          {gift.stripe_subscription_id && <Row k="Subscription" v={<code>{gift.stripe_subscription_id}</code>} />}
          {gift.stripe_invoice_id && <Row k="Invoice" v={<code>{gift.stripe_invoice_id}</code>} />}
          {gift.card_last4 && <Row k="Card" v={`•••• ${gift.card_last4}`} />}
        </section>
      )}

      <div style={{ display: "flex", gap: ".75rem", marginTop: "1rem" }}>
        <form action={resendReceipt}>
          <input type="hidden" name="giftId" value={gift.id} />
          <button type="submit" style={btn}>{gift.receipt_number ? "Resend receipt" : "Send receipt"}</button>
        </form>
        {canManage(ctx.role) && gift.status !== "refunded" && (
          <form action={refundGift}>
            <input type="hidden" name="giftId" value={gift.id} />
            <button type="submit" style={btnDanger}>Refund</button>
          </form>
        )}
      </div>
      {!canManage(ctx.role) && (
        <p style={{ color: "#999", fontSize: ".8rem", marginTop: ".5rem" }}>Refunds require an admin role.</p>
      )}

      {constituent?.email && <ThankYouButton giftId={gift.id} />}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "1rem", padding: ".35rem 0", fontSize: ".92rem" }}>
      <span style={{ color: "#888" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", marginTop: "1rem" };
const btn: React.CSSProperties = { padding: ".5rem .9rem", border: "1px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: ".9rem" };
const btnDanger: React.CSSProperties = { padding: ".5rem .9rem", border: "1px solid #e0b4b4", borderRadius: 8, background: "#fdecec", color: "#9b1c1c", cursor: "pointer", fontSize: ".9rem" };
