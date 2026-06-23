import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Task, TaskWithRefs, TaskStatus } from "@/types/db";

/**
 * Tasks — to-dos, optionally tied to a constituent, with a due date and assignee.
 * The org-wide Tasks page lists open tasks by due date (overdue first); the
 * constituent page shows that contact's tasks. All org-scoped.
 */

/** Org-wide task list. status: optional filter; otherwise open-by-due then done. */
export async function listTasks(orgId: string, opts: { status?: TaskStatus } = {}): Promise<TaskWithRefs[]> {
  assertOrgId(orgId);
  if (opts.status) {
    return (await sql`
      SELECT t.*,
             coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email) AS constituent_name,
             u.name AS assignee_name, u.email AS assignee_email
      FROM tasks t
      LEFT JOIN constituents c ON c.id = t.constituent_id AND c.org_id = t.org_id
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.org_id = ${orgId} AND t.status = ${opts.status}
      ORDER BY (t.due_at IS NULL), t.due_at ASC, t.created_at DESC
    `) as unknown as TaskWithRefs[];
  }
  return (await sql`
    SELECT t.*,
           coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.org_name, c.email) AS constituent_name,
           u.name AS assignee_name, u.email AS assignee_email
    FROM tasks t
    LEFT JOIN constituents c ON c.id = t.constituent_id AND c.org_id = t.org_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.org_id = ${orgId}
    ORDER BY (t.status = 'done'), (t.due_at IS NULL), t.due_at ASC, t.created_at DESC
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
    notes?: string | null;
    dueAt?: string | null;       // 'YYYY-MM-DD'
    constituentId?: string | null;
    assignedTo?: string | null;
    createdBy?: string | null;
  },
): Promise<Task> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO tasks (org_id, title, notes, due_at, constituent_id, assigned_to, created_by)
    VALUES (
      ${orgId}, ${input.title}, ${input.notes ?? null}, ${input.dueAt || null}::date,
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
