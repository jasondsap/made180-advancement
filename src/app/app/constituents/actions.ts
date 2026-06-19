"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, canManage } from "@/lib/auth";
import {
  createConstituent,
  updateConstituent,
  mergeConstituents,
  findConstituentByEmail,
  getConstituentById,
} from "@/repositories/constituents";
import { addRole, removeRole } from "@/repositories/attributes";
import { addRelationship, removeRelationship } from "@/repositories/relationships";
import type { ConstituentType } from "@/types/db";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function addr(fd: FormData) {
  const a = {
    line1: str(fd, "line1") || undefined,
    line2: str(fd, "line2") || undefined,
    city: str(fd, "city") || undefined,
    state: str(fd, "state") || undefined,
    zip: str(fd, "zip") || undefined,
    country: str(fd, "country") || "US",
  };
  return a.line1 || a.city || a.state || a.zip ? a : null;
}

export async function createConstituentAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const email = str(fd, "email");
  let newId: string | undefined;
  let error: string | undefined;
  try {
    if (!email && !str(fd, "firstName") && !str(fd, "lastName") && !str(fd, "orgName"))
      throw new Error("Enter a name or email");
    const con = await createConstituent(ctx.orgId, {
      type: (str(fd, "type") as ConstituentType) || "individual",
      firstName: str(fd, "firstName") || null,
      lastName: str(fd, "lastName") || null,
      orgName: str(fd, "orgName") || null,
      email: email || null,
      phone: str(fd, "phone") || null,
      address: addr(fd),
      source: "manual",
    });
    newId = con.id;
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not create";
  }
  if (error) redirect(`/app/constituents/new?error=${encodeURIComponent(error)}`);
  revalidatePath("/app/constituents");
  redirect(`/app/constituents/${newId}`);
}

export async function updateConstituentAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const id = str(fd, "id");
  let error: string | undefined;
  try {
    await updateConstituent(ctx.orgId, id, {
      type: (str(fd, "type") as ConstituentType) || "individual",
      firstName: str(fd, "firstName") || null,
      lastName: str(fd, "lastName") || null,
      orgName: str(fd, "orgName") || null,
      email: str(fd, "email") || null,
      phone: str(fd, "phone") || null,
      address: addr(fd),
      doNotContact: fd.get("doNotContact") === "on",
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not save";
  }
  if (error) redirect(`/app/constituents/${id}/edit?error=${encodeURIComponent(error)}`);
  revalidatePath(`/app/constituents/${id}`);
  redirect(`/app/constituents/${id}?msg=saved`);
}

export async function addRoleAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const id = str(fd, "id");
  await addRole(ctx.orgId, id, str(fd, "role"));
  revalidatePath(`/app/constituents/${id}`);
}

export async function removeRoleAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const id = str(fd, "id");
  await removeRole(ctx.orgId, id, str(fd, "role"));
  revalidatePath(`/app/constituents/${id}`);
}

export async function addRelationshipAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const id = str(fd, "id");
  const other = await resolveConstituent(ctx.orgId, str(fd, "other"));
  let msg = "rel_added";
  if (!other) msg = "rel_notfound";
  else {
    try {
      await addRelationship(ctx.orgId, id, other.id, str(fd, "relType") || "household");
    } catch {
      msg = "rel_error";
    }
  }
  revalidatePath(`/app/constituents/${id}`);
  redirect(`/app/constituents/${id}?msg=${msg}`);
}

export async function removeRelationshipAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const id = str(fd, "id");
  await removeRelationship(ctx.orgId, str(fd, "relId"));
  revalidatePath(`/app/constituents/${id}`);
}

export async function mergeAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  if (!canManage(ctx.role)) throw new Error("forbidden");
  const targetId = str(fd, "id"); // keep this one
  const source = await resolveConstituent(ctx.orgId, str(fd, "source"));
  let msg = "merged";
  if (!source) msg = "merge_notfound";
  else if (source.id === targetId) msg = "merge_self";
  else {
    try {
      await mergeConstituents(ctx.orgId, source.id, targetId);
    } catch (e) {
      console.error("[constituents] merge failed", e);
      msg = "merge_error";
    }
  }
  revalidatePath("/app/constituents");
  redirect(`/app/constituents/${targetId}?msg=${msg}`);
}

async function resolveConstituent(orgId: string, key: string) {
  if (!key) return undefined;
  if (UUID_RE.test(key)) return getConstituentById(orgId, key);
  return findConstituentByEmail(orgId, key);
}
