import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getOrgById } from "@/repositories/orgs";
import { getMessage } from "@/repositories/engage/messages";
import { listRecipients } from "@/repositories/engage/recipients";
import { listMergeFields } from "@/repositories/engage/mergeFields";
import { getAddressByType } from "@/repositories/engage/addresses";
import { listConstituentsByIds } from "@/repositories/constituents";
import { buildMailingPdf } from "@/domain/engage/mailingPdf";

/** Stream the merged letters PDF for a mailing (one page per recipient). */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const message = await getMessage(ctx.orgId, id);
  if (!message || message.channel !== "mail") return NextResponse.json({ error: "not found" }, { status: 404 });

  const [org, recips, mergeFields, orgAddress] = await Promise.all([
    getOrgById(ctx.orgId),
    listRecipients(ctx.orgId, id),
    listMergeFields(ctx.orgId),
    getAddressByType(ctx.orgId, "organization"),
  ]);
  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 });

  const ids = recips.map((r) => r.constituent_id).filter((x): x is string => Boolean(x));
  const constituents = await listConstituentsByIds(ctx.orgId, ids);
  if (constituents.length === 0) return NextResponse.json({ error: "no addressable recipients" }, { status: 400 });

  const pdf = buildMailingPdf({
    org,
    orgAddress,
    bodyMd: message.body_md ?? "",
    mergeFields,
    recipients: constituents,
    now: new Date(),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="mailing-${id.slice(0, 8)}.pdf"`,
    },
  });
}
