import { getAuthContext, canManage } from "@/lib/auth";
import { listMergeFields, seedDefaultMergeFields } from "@/repositories/engage/mergeFields";
import { createMergeFieldAction, updateMergeFieldAction, deleteMergeFieldAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function MergeFieldsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const manage = canManage(ctx.role);
  await seedDefaultMergeFields(ctx.orgId); // idempotent
  const fields = await listMergeFields(ctx.orgId);

  return (
    <section style={{ border: "1px solid var(--app-border)", borderRadius: 12, padding: "1.25rem", background: "#fff" }}>
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 .25rem" }}>Merge Fields</h2>
      <p style={{ color: "var(--app-text-soft)", fontSize: ".88rem", margin: "0 0 1rem" }}>
        Variables that fill in from a contact's record. The default value is used when the contact's field is blank.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
        <thead><tr style={{ textAlign: "left", color: "#888" }}><th style={th}>Field</th><th style={th}>Tag</th><th style={th}>Default</th><th style={th} /></tr></thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.id} style={{ borderTop: "1px solid var(--app-border)" }}>
              <td style={td}>{f.name}</td>
              <td style={td}><code>{f.tag}</code></td>
              <td style={td}>
                {manage ? (
                  <form action={updateMergeFieldAction} style={{ display: "flex", gap: ".4rem" }}>
                    <input type="hidden" name="id" value={f.id} />
                    <input name="defaultValue" defaultValue={f.default_value ?? ""} placeholder="—" style={{ ...inp, width: 140 }} />
                    <button style={btnGhost}>Save</button>
                  </form>
                ) : (f.default_value ?? "—")}
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                {manage && <form action={deleteMergeFieldAction}><input type="hidden" name="id" value={f.id} /><button style={btnDanger}>Remove</button></form>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {manage && (
        <form action={createMergeFieldAction} style={{ display: "flex", gap: ".5rem", marginTop: "1rem", alignItems: "end", flexWrap: "wrap" }}>
          <input name="name" placeholder="Field name" style={inp} required />
          <input name="tag" placeholder="{{contact.custom}}" style={inp} required />
          <input name="defaultValue" placeholder="Default value" style={inp} />
          <button style={btnPrimary}>Add field</button>
        </form>
      )}
    </section>
  );
}
const th: React.CSSProperties = { padding: ".4rem .5rem", fontWeight: 600, fontSize: ".8rem" };
const td: React.CSSProperties = { padding: ".4rem .5rem", verticalAlign: "middle" };
const inp: React.CSSProperties = { padding: ".4rem .55rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".88rem" };
const btnPrimary: React.CSSProperties = { padding: ".45rem .9rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".85rem", fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: ".35rem .7rem", borderRadius: 7, background: "transparent", color: "var(--brand)", border: "1px solid var(--app-border)", fontSize: ".8rem", cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: ".35rem .7rem", borderRadius: 7, background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", fontSize: ".8rem", cursor: "pointer" };
