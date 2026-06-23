"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createTask, setTaskStatus, deleteTask } from "@/repositories/tasks";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Where to send the user back after a task action (tasks page or a constituent). */
function nextPath(fd: FormData): string {
  const n = str(fd, "next");
  return n.startsWith("/app/") ? n : "/app/tasks";
}

export async function createTaskAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const title = str(fd, "title");
  if (!title) redirect(nextPath(fd));
  await createTask(ctx.orgId, {
    title,
    notes: str(fd, "notes") || null,
    dueAt: str(fd, "dueAt") || null,
    constituentId: str(fd, "constituentId") || null,
    assignedTo: str(fd, "assignedTo") || null,
    createdBy: ctx.user.id,
  });
  const next = nextPath(fd);
  revalidatePath(next);
  redirect(next);
}

export async function toggleTaskAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  const status = str(fd, "status") === "done" ? "done" : "open";
  await setTaskStatus(ctx.orgId, str(fd, "taskId"), status);
  const next = nextPath(fd);
  revalidatePath(next);
  redirect(next);
}

export async function deleteTaskAction(fd: FormData) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("unauthorized");
  await deleteTask(ctx.orgId, str(fd, "taskId"));
  const next = nextPath(fd);
  revalidatePath(next);
  redirect(next);
}
