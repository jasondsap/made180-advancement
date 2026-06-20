import Link from "next/link";
import { notFound } from "next/navigation";
import { flags } from "@/lib/featureFlags";
import { getAuthContext, canManage } from "@/lib/auth";
import { getMessage } from "@/repositories/engage/messages";
import { listRecipients } from "@/repositories/engage/recipients";
import { listFunds } from "@/repositories/funds";
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
    const funds = await listFunds(ctx.orgId, { activeOnly: true });
    return (
      <div>
        <Back />
        <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>Edit mailing</h2>
        <MailingComposer
          messageId={message.id}
          defaults={{ name: message.name, body: message.body_md ?? "" }}
          funds={funds.map((f) => ({ id: f.id, name: f.name }))}
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

      <a href={`/api/tidings/mailings/${message.id}/pdf`} style={{ display: "inline-block", padding: ".6rem 1.2rem", borderRadius: 8, background: "var(--brand)", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
        Download letters (PDF)
      </a>

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
