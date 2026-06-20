import { getAuthContext, canManage } from "@/lib/auth";
import { listAddresses } from "@/repositories/engage/addresses";
import { createAddressAction, deleteAddressAction } from "../../actions";
import type { EngageAddress, AddressType } from "@/types/engage";

export const dynamic = "force-dynamic";

const LABELS: Record<AddressType, { title: string; help: string }> = {
  organization: { title: "Organization address", help: "Your legal address, shown at the bottom of every email (CAN-SPAM)." },
  mailing_return: { title: "Mailing & return address", help: "Used as the return address on printed mailings." },
};

export default async function AddressesPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  const addresses = await listAddresses(ctx.orgId);
  const byType = (t: AddressType) => addresses.find((a) => a.type === t);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {(["organization", "mailing_return"] as AddressType[]).map((type) => {
        const a = byType(type);
        return (
          <section key={type} style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "1.25rem", background: "#fff" }}>
            <h2 style={{ fontSize: "1.1rem", margin: "0 0 .2rem" }}>{LABELS[type].title}</h2>
            <p style={{ color: "var(--app-text-soft)", fontSize: ".85rem", margin: "0 0 1rem" }}>{LABELS[type].help}</p>
            {a ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <address style={{ fontStyle: "normal", fontSize: ".9rem", lineHeight: 1.5 }}>
                  {a.line1}<br />{a.line2 && <>{a.line2}<br /></>}{a.city}, {a.state} {a.postal_code}<br />{a.country}
                </address>
                {manage && <form action={deleteAddressAction}><input type="hidden" name="id" value={a.id} /><button style={btnDanger}>Remove</button></form>}
              </div>
            ) : manage ? (
              <AddressForm type={type} />
            ) : <p style={{ color: "#999", fontSize: ".88rem" }}>Not set.</p>}
          </section>
        );
      })}
    </div>
  );
}

function AddressForm({ type }: { type: AddressType }) {
  return (
    <form action={createAddressAction} style={{ display: "grid", gap: ".5rem", maxWidth: 460 }}>
      <input type="hidden" name="type" value={type} />
      <input name="line1" placeholder="Street address" style={inp} required />
      <input name="line2" placeholder="Suite / unit (optional)" style={inp} />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: ".5rem" }}>
        <input name="city" placeholder="City" style={inp} required />
        <input name="state" placeholder="State" style={inp} required />
        <input name="postalCode" placeholder="ZIP" style={inp} required />
      </div>
      <div><button style={btnPrimary}>Save address</button></div>
    </form>
  );
}
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".9rem", width: "100%", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: ".4rem .8rem", borderRadius: 7, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".82rem", cursor: "pointer", height: "fit-content" };
