import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Task, TaskWithRefs, TaskStatus, TaskType } from "@/types/db";

/**
 * Tasks — to-dos, optionally tied to a constituent, with a typed activity
 * (call/email/visit/…), a due date + optional time, and an assignee. The org-wide
 * Tasks page searches/filters/sorts this list; the constituent page shows that
 * contact's tasks. All org-scoped.
 */

/** Whitelisted sort keys for the Tasks list. Anything else falls back to "due". */
export type TaskSort = "due" | "type" | "constituent" | "created";

export async function listTasks(
  orgId: string,
  opts: { status?: TaskStatus; q?: string; type?: TaskType | null; sort?: TaskSort } = {},
): Promise<TaskWithRefs[]> {
  assertOrgId(orgId);

  // Params are nullable so one query covers every filter combination — each
  // predicate short-circuits to TRUE when its param is null.
  const status = opts.status ?? null;
  const type = opts.type || null;
  const q = opts.q?.trim();
  const like = q ? `%${q.toLowerCase()}%` : null;
  const sort: TaskSort = opts.sort ?? "due";

  return (await sql`
    SELECT t.*,
           coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email) AS constituent_name,
           u.name AS assignee_name, u.email AS assignee_email
    FROM tasks t
    LEFT JOIN constituents c ON c.id = t.constituent_id AND c.org_id = t.org_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.org_id = ${orgId}
      AND (${status}::text IS NULL OR t.status = ${status})
      AND (${type}::text IS NULL OR t.type = ${type})
      AND (${like}::text IS NULL OR (
            lower(t.title) LIKE ${like}
         OR lower(coalesce(t.notes, '')) LIKE ${like}
         OR lower(coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email, '')) LIKE ${like}
      ))
    ORDER BY
      -- open before done, always; the chosen sort only orders within that.
      (t.status = 'done'),
      -- Non-selected sorts evaluate to NULL for every row, so they're no-ops.
      -- Untyped / unlinked rows sort last via the 'zzzz' sentinel.
      CASE WHEN ${sort} = 'type' THEN coalesce(t.type, 'zzzz') END ASC,
      CASE WHEN ${sort} = 'constituent'
           THEN lower(coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email, 'zzzz')) END ASC,
      CASE WHEN ${sort} = 'created' THEN t.created_at END DESC,
      (t.due_at IS NULL), t.due_at ASC, t.due_time ASC NULLS FIRST, t.created_at DESC
  `) as unknown as TaskWithRefs[];
}

/** Tasks for a single constituent (both open + done), open first by due date. */
export async function listTasksForConstituent(orgId: string, constituentId: string): Promise<Task[]> {
  assertOrgId(orgId);
  return (await sql`
    SELECT * FROM tasks
    WHERE org_id = ${orgId} AND constituent_id = ${constituentId}
    ORDER BY (status = 'done'), (due_at IS NULL), due_at ASC, created_at DESC
  `) as unknown as Task[];
}

/** Count of open tasks (for the nav badge). */
export async function countOpenTasks(orgId: string): Promise<number> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT count(*)::int AS n FROM tasks WHERE org_id = ${orgId} AND status = 'open'
  `) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function createTask(
  orgId: string,
  input: {
    title: string;
    type?: TaskType | null;
    notes?: string | null;
    dueAt?: string | null;       // 'YYYY-MM-DD'
    dueTime?: string | null;     // 'HH:MM' (wall clock, no zone)
    constituentId?: string | null;
    assignedTo?: string | null;
    createdBy?: string | null;
  },
): Promise<Task> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO tasks (org_id, title, type, notes, due_at, due_time, constituent_id, assigned_to, created_by)
    VALUES (
      ${orgId}, ${input.title}, ${input.type || null}, ${input.notes ?? null},
      ${input.dueAt || null}::date, ${input.dueTime || null}::time,
      ${input.constituentId ?? null}, ${input.assignedTo ?? null}, ${input.createdBy ?? null}
    )
    RETURNING *
  `) as unknown as Task[];
  return rows[0]!;
}

/** Toggle done/open; stamps completed_at when closing, clears it when reopening. */
export async function setTaskStatus(orgId: string, id: string, status: TaskStatus): Promise<void> {
  assertOrgId(orgId);
  await sql`
    UPDATE tasks
    SET status = ${status},
        completed_at = ${status === "done" ? new Date() : null},
        updated_at = now()
    WHERE org_id = ${orgId} AND id = ${id}
  `;
}

export async function deleteTask(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`DELETE FROM tasks WHERE org_id = ${orgId} AND id = ${id}`;
}
