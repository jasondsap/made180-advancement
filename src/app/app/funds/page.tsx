import { getAuthContext, canManage } from "@/lib/auth";
import { listFunds } from "@/repositories/funds";
import { createFundAction, updateFundAction } from "../settings/actions";

export default async function FundsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const funds = await listFunds(ctx.orgId);
  const manage = canManage(ctx.role);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Funds</h1>

      <div style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
          <thead><tr style={{ textAlign: "left", color: "#777", background: "#fafbfa" }}>
            <th style={th}>Code</th><th style={th}>Name</th><th style={th}>Restricted</th><th style={th}>Active</th>{manage && <th style={th}></th>}
          </tr></thead>
          <tbody>
            {funds.map((f) => (
              <tr key={f.id} style={{ borderTop: "1px solid #f1f2f1" }}>
                {manage ? (
                  <form action={updateFundAction} style={{ display: "contents" }}>
                    <input type="hidden" name="id" value={f.id} />
                    <td style={td}><code>{f.code}</code></td>
                    <td style={td}><input name="name" defaultValue={f.name} style={inp} /></td>
                    <td style={td}><input type="checkbox" name="restricted" defaultChecked={f.restricted} /></td>
                    <td style={td}><input type="checkbox" name="active" defaultChecked={f.active} /></td>
                    <td style={td}><button type="submit" style={btn}>Save</button></td>
                  </form>
                ) : (
                  <>
                    <td style={td}><code>{f.code}</code></td>
                    <td style={td}>{f.name}</td>
                    <td style={td}>{f.restricted ? "Yes" : "No"}</td>
                    <td style={td}>{f.active ? "Yes" : "No"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {manage && (
        <section style={{ background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", marginTop: "1rem" }}>
          <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Add fund</h2>
          <form action={createFundAction} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
            <input name="code" placeholder="code (e.g. scholarship)" style={inp} required />
            <input name="name" placeholder="Display name" style={{ ...inp, flex: 1, minWidth: 180 }} required />
            <label style={{ fontSize: ".88rem", display: "flex", gap: ".3rem", alignItems: "center" }}><input type="checkbox" name="restricted" /> Restricted</label>
            <button type="submit" style={btnPrimary}>Add</button>
          </form>
        </section>
      )}
      {!manage && <p style={{ color: "#999", fontSize: ".82rem", marginTop: "1rem" }}>Fund management requires an admin role.</p>}
    </div>
  );
}

const th: React.CSSProperties = { padding: ".6rem .8rem", fontWeight: 600 };
const td: React.CSSProperties = { padding: ".5rem .8rem" };
const inp: React.CSSProperties = { padding: ".4rem .5rem", border: "1px solid #ccc", borderRadius: 6, fontSize: ".88rem" };
const btn: React.CSSProperties = { padding: ".35rem .7rem", border: "1px solid #ccc", borderRadius: 6, background: "#fff", fontSize: ".82rem", cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 8, background: "#1c6e3c", color: "#fff", border: "none", fontSize: ".88rem", fontWeight: 600, cursor: "pointer" };
