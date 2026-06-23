import Link from "next/link";
import { notFound } from "next/navigation";
import { flags } from "@/lib/featureFlags";
import { getAuthContext, canManage } from "@/lib/auth";
import { getMessage } from "@/repositories/engage/messages";
import { listRecipients } from "@/repositories/engage/recipients";
import { listFunds } from "@/repositories/funds";
import { listSegments } from "@/repositories/engage/segments";
import { MailingComposer } from "../MailingComposer";
import { saveMailingDraftAction, generateMailingAction, deleteMailingAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function MailingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  if (!flags().engageMailings) notFound();
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { msg } = await searchParams;
  const message = await getMessage(ctx.orgId, id);
  if (!message || message.channel !== "mail") notFound();

  if (message.status === "draft" && canManage(ctx.role)) {
    const [funds, segments] = await Promise.all([
      listFunds(ctx.orgId, { activeOnly: true }),
      listSegments(ctx.orgId),
    ]);
    return (
      <div>
        <Back />
        <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>Edit mailing</h2>
        <MailingComposer
          messageId={message.id}
          defaults={{ name: message.name, body: message.body_md ?? "" }}
          funds={funds.map((f) => ({ id: f.id, name: f.name }))}
          segments={segments.map((s) => ({ id: s.id, name: s.name }))}
          saveDraftAction={saveMailingDraftAction}
          generateAction={generateMailingAction}
        />
        <form action={deleteMailingAction} style={{ marginTop: "1.5rem" }}>
          <input type="hidden" name="id" value={message.id} />
          <button type="submit" style={{ background: "transparent", color: "#9b1c1c", border: "1px solid #e6c3c0", borderRadius: 7, padding: ".4rem .8rem", fontSize: ".85rem", cursor: "pointer" }}>Delete draft</button>
        </form>
      </div>
    );
  }

  const recipients = await listRecipients(ctx.orgId, message.id);

  return (
    <div>
      <Back />
      <h2 style={{ fontSize: "1.25rem", margin: "0 0 .25rem" }}>{message.name}</h2>
      <p style={{ color: "#7a7367", fontSize: ".9rem", margin: "0 0 1rem" }}>Generated {message.sent_at ? new Date(message.sent_at).toLocaleDateString() : ""} · {recipients.length} letter(s).</p>
      {msg === "generated" && <div style={{ background: "#edf1ec", color: "var(--forest)", padding: ".7rem .9rem", borderRadius: 8, fontSize: ".9rem", marginBottom: "1rem" }}>Letters generated. Download the print-ready PDF below.</div>}

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <a href={`/api/tidings/mailings/${message.id}/pdf`} style={{ display: "inline-block", padding: ".6rem 1.2rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
          Download letters (PDF)
        </a>
        <a href={`/api/tidings/mailings/${message.id}/pdf?format=labels`} style={{ display: "inline-block", padding: ".6rem 1.2rem", borderRadius: 8, background: "#fff", color: "var(--brand)", border: "1px solid var(--brand)", textDecoration: "none", fontWeight: 600 }}>
          Labels (Avery 5160)
        </a>
        <a href={`/api/tidings/mailings/${message.id}/pdf?format=envelopes`} style={{ display: "inline-block", padding: ".6rem 1.2rem", borderRadius: 8, background: "#fff", color: "var(--brand)", border: "1px solid var(--brand)", textDecoration: "none", fontWeight: 600 }}>
          Envelopes (#10)
        </a>
      </div>

      <div style={{ marginTop: "1.5rem", border: "1px solid var(--app-border)", borderRadius: 10, padding: "1rem", background: "#fff", maxWidth: 560 }}>
        <h3 style={{ fontSize: ".95rem", margin: "0 0 .5rem" }}>Letter body</h3>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-body)", fontSize: ".92rem", color: "#333", margin: 0 }}>{message.body_md}</pre>
      </div>
    </div>
  );
}

function Back() {
  return <p style={{ marginBottom: ".5rem" }}><Link href="/app/tidings/mailings" style={{ color: "var(--brand)", fontSize: ".88rem" }}>← Mailings</Link></p>;
}
