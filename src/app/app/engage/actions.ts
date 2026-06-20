"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import { getResendClient } from "@/lib/email";
import { createDomain, getDomain, setDomainVerification, deleteDomain } from "@/repositories/engage/domains";
import { createSender, setDefaultSender, deleteSender } from "@/repositories/engage/senders";
import { createAddress, deleteAddress } from "@/repositories/engage/addresses";
import { createMergeField, updateMergeFieldDefault, deleteMergeField } from "@/repositories/engage/mergeFields";
import { createMessage, updateMessage, getMessage, deleteMessage } from "@/repositories/engage/messages";
import { sendEmailMessage } from "@/domain/engage/send";
import type { AudienceSpec, AddressType, EngageDomain } from "@/types/engage";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function requireManager() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden: Engage requires an admin role");
  return ctx;
}

function buildAudience(fd: FormData): AudienceSpec {
  const mode = str(fd, "audienceMode");
  if (mode === "fund" && str(fd, "fundId")) return { mode: "fund", fundId: str(fd, "fundId") };
  if (mode === "manual") {
    const ids = String(fd.get("constituentIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return { mode: "manual", constituentIds: ids };
  }
  return { mode: "all" };
}

// ---------- Domains (Resend) ----------

/** Map Resend's domain record shape to our dns_records, defensively. */
function mapRecords(records: unknown): EngageDomain["dns_records"] {
  if (!Array.isArray(records)) return [];
  return records.map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      type: String(rec.type ?? "TXT"),
      host: String(rec.name ?? rec.host ?? ""),
      value: String(rec.value ?? ""),
      verified: String(rec.status ?? "") === "verified",
    };
  });
}

export async function createDomainAction(fd: FormData) {
  const ctx = await requireManager();
  const domain = str(fd, "domain");
  if (!domain) throw new Error("Domain is required");
  let records: EngageDomain["dns_records"] = [];
  let resendId: string | null = null;
  try {
    const res = (await getResendClient().domains.create({ name: domain })) as unknown as { data?: { id?: string; records?: unknown }; error?: { message?: string } | null };
    if (res.error) throw new Error(res.error.message);
    resendId = res.data?.id ?? null;
    records = mapRecords(res.data?.records);
  } catch (e) {
    throw new Error(`Could not register domain with Resend: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  await createDomain(ctx.orgId, { domain, dnsRecords: records, resendDomainId: resendId });
  revalidatePath("/app/engage/settings/domains");
  redirect("/app/engage/settings/domains?msg=added");
}

export async function verifyDomainAction(fd: FormData) {
  const ctx = await requireManager();
  const id = str(fd, "id");
  const domain = await getDomain(ctx.orgId, id);
  if (!domain?.resend_domain_id) throw new Error("Domain not registered with Resend");
  try {
    const client = getResendClient();
    await client.domains.verify(domain.resend_domain_id);
    const got = (await client.domains.get(domain.resend_domain_id)) as unknown as { data?: { status?: string; records?: unknown } };
    const verified = String(got.data?.status ?? "") === "verified";
    await setDomainVerification(ctx.orgId, id, verified, mapRecords(got.data?.records));
  } catch (e) {
    throw new Error(`Verification check failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  revalidatePath("/app/engage/settings/domains");
  redirect("/app/engage/settings/domains");
}

export async function deleteDomainAction(fd: FormData) {
  const ctx = await requireManager();
  await deleteDomain(ctx.orgId, str(fd, "id"));
  revalidatePath("/app/engage/settings/domains");
  redirect("/app/engage/settings/domains");
}

// ---------- Senders ----------

export async function createSenderAction(fd: FormData) {
  const ctx = await requireManager();
  if (str(fd, "fromName") && str(fd, "fromEmail")) {
    await createSender(ctx.orgId, {
      fromName: str(fd, "fromName"),
      fromEmail: str(fd, "fromEmail"),
      replyTo: str(fd, "replyTo") || null,
      domainId: str(fd, "domainId") || null,
      isDefault: fd.get("isDefault") === "on",
    });
  }
  revalidatePath("/app/engage/settings/senders");
  redirect("/app/engage/settings/senders");
}

export async function setDefaultSenderAction(fd: FormData) {
  const ctx = await requireManager();
  await setDefaultSender(ctx.orgId, str(fd, "id"));
  revalidatePath("/app/engage/settings/senders");
  redirect("/app/engage/settings/senders");
}

export async function deleteSenderAction(fd: FormData) {
  const ctx = await requireManager();
  await deleteSender(ctx.orgId, str(fd, "id"));
  revalidatePath("/app/engage/settings/senders");
  redirect("/app/engage/settings/senders");
}

// ---------- Addresses ----------

export async function createAddressAction(fd: FormData) {
  const ctx = await requireManager();
  const type = (str(fd, "type") === "mailing_return" ? "mailing_return" : "organization") as AddressType;
  await createAddress(ctx.orgId, {
    type,
    line1: str(fd, "line1"),
    line2: str(fd, "line2") || null,
    city: str(fd, "city"),
    state: str(fd, "state"),
    postalCode: str(fd, "postalCode"),
    country: str(fd, "country") || "US",
  });
  revalidatePath("/app/engage/settings/addresses");
  redirect("/app/engage/settings/addresses");
}

export async function deleteAddressAction(fd: FormData) {
  const ctx = await requireManager();
  await deleteAddress(ctx.orgId, str(fd, "id"));
  revalidatePath("/app/engage/settings/addresses");
  redirect("/app/engage/settings/addresses");
}

// ---------- Merge fields ----------

export async function createMergeFieldAction(fd: FormData) {
  const ctx = await requireManager();
  if (str(fd, "name") && str(fd, "tag")) {
    await createMergeField(ctx.orgId, { name: str(fd, "name"), tag: str(fd, "tag"), defaultValue: str(fd, "defaultValue") || null });
  }
  revalidatePath("/app/engage/settings/merge-fields");
  redirect("/app/engage/settings/merge-fields");
}

export async function updateMergeFieldAction(fd: FormData) {
  const ctx = await requireManager();
  await updateMergeFieldDefault(ctx.orgId, str(fd, "id"), str(fd, "defaultValue") || null);
  revalidatePath("/app/engage/settings/merge-fields");
  redirect("/app/engage/settings/merge-fields");
}

export async function deleteMergeFieldAction(fd: FormData) {
  const ctx = await requireManager();
  await deleteMergeField(ctx.orgId, str(fd, "id"));
  revalidatePath("/app/engage/settings/merge-fields");
  redirect("/app/engage/settings/merge-fields");
}

// ---------- Email messages ----------

/** Create a new draft or update an existing one. Returns by redirecting to the list. */
export async function saveEmailDraftAction(fd: FormData) {
  const ctx = await requireManager();
  const id = str(fd, "id");
  const fields = {
    name: str(fd, "name") || "Untitled email",
    subject: str(fd, "subject") || null,
    bodyMd: str(fd, "body") || null,
    senderId: str(fd, "senderId") || null,
    audience: buildAudience(fd),
  };
  if (id) {
    await updateMessage(ctx.orgId, id, fields);
  } else {
    await createMessage(ctx.orgId, { channel: "email", ...fields, createdBy: ctx.user.id });
  }
  revalidatePath("/app/engage/email");
  redirect("/app/engage/email?tab=drafts&msg=saved");
}

/** Create/update the draft, then send it now. Redirects to the message detail. */
export async function sendEmailNowAction(fd: FormData) {
  const ctx = await requireManager();
  let id = str(fd, "id");
  const fields = {
    name: str(fd, "name") || "Untitled email",
    subject: str(fd, "subject") || null,
    bodyMd: str(fd, "body") || null,
    senderId: str(fd, "senderId") || null,
    audience: buildAudience(fd),
  };
  if (id) {
    await updateMessage(ctx.orgId, id, fields);
  } else {
    const m = await createMessage(ctx.orgId, { channel: "email", ...fields, createdBy: ctx.user.id });
    id = m.id;
  }
  const msg = await getMessage(ctx.orgId, id);
  if (!msg?.subject || !msg.body_md) throw new Error("Subject and body are required to send");
  await sendEmailMessage(ctx.orgId, id);
  revalidatePath("/app/engage/email");
  redirect(`/app/engage/email/${id}?msg=sent`);
}

export async function deleteMessageAction(fd: FormData) {
  const ctx = await requireManager();
  await deleteMessage(ctx.orgId, str(fd, "id"));
  revalidatePath("/app/engage/email");
  redirect("/app/engage/email?tab=drafts");
}
