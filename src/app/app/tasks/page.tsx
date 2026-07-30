import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { listTasks, type TaskSort } from "@/repositories/tasks";
import { listMembersForOrg } from "@/repositories/users";
import { fmtDate, fmtTime } from "@/lib/format";
import { TASK_TYPES, TASK_TYPE_LABELS, type TaskWithRefs, type TaskType } from "@/types/db";
import { ConstituentPicker } from "@/components/ConstituentPicker";
import { createTaskAction, toggleTaskAction, deleteTaskAction } from "./actions";

export const dynamic = "force-dynamic";

const SORTS: ReadonlyArray<{ value: TaskSort; label: string }> = [
  { value: "due", label: "Due date" },
  { value: "type", label: "Type" },
  { value: "constituent", label: "Constituent" },
  { value: "created", label: "Recently added" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; sort?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = TASK_TYPES.some((t) => t.value === sp.type) ? (sp.type as TaskType) : null;
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "due") as TaskSort;

  const [tasks, members] = await Promise.all([
    listTasks(ctx.orgId, { q: q || undefined, type, sort }),
    listMembersForOrg(ctx.orgId),
  ]);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const filtering = Boolean(q || type);

  // Round-trip the current filters through actions so completing a task doesn't
  // drop you back to an unfiltered list.
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (type) qs.set("type", type);
  if (sort !== "due") qs.set("sort", sort);
  const next = qs.toString() ? `/app/tasks?${qs}` : "/app/tasks";

  const memberName = (m: { name: string | null; email: string }) => m.name || m.email;

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: "1.6rem", margin: "0 0 .25rem" }}>Tasks</h1>
      <p style={{ color: "var(--app-text-soft)", fontSize: ".9rem", margin: "0 0 1.25rem" }}>
        Follow-ups and to-dos. Overdue items are flagged.
      </p>

      {/* New task */}
      <section style={{ ...card, marginBottom: "1.5rem" }}>
        <h2 style={h2}>Add a task</h2>
        <form action={createTaskAction} style={{ display: "grid", gap: ".6rem", maxWidth: 620 }}>
          <input type="hidden" name="next" value={next} />
          <input name="title" placeholder="Call Jane about year-end gift" style={inp} required />
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <label style={lbl}>Type
              <select name="type" style={inp} defaultValue="">
                <option value="">—</option>
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label style={lbl}>Due date
              <input type="date" name="dueAt" style={inp} />
            </label>
            <label style={lbl}>Time
              <input type="time" name="dueTime" style={inp} />
            </label>
            <label style={lbl}>Assign to
              <select name="assignedTo" style={inp}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
              </select>
            </label>
          </div>
          <label style={{ ...lbl, maxWidth: 320 }}>Constituent
            <ConstituentPicker />
          </label>
          <textarea name="notes" placeholder="Notes (optional)" style={{ ...inp, minHeight: 60 }} />
          <div><button style={btnPrimary}>Add task</button></div>
        </form>
      </section>

      {/* Search / filter / sort — a GET form, so the view is linkable + bookmarkable */}
      <form method="GET" style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: ".9rem" }}>
        <label style={{ ...lbl, flex: 1, minWidth: 200 }}>Search
          <input name="q" defaultValue={q} placeholder="Title, notes, or constituent" style={inp} />
        </label>
        <label style={lbl}>Type
          <select name="type" defaultValue={type ?? ""} style={inp}>
            <option value="">All types</option>
            {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label style={lbl}>Sort by
          <select name="sort" defaultValue={sort} style={inp}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <button style={btnSecondary}>Apply</button>
        {filtering && <Link href="/app/tasks" style={{ fontSize: ".85rem", padding: ".5rem 0" }}>Clear</Link>}
      </form>

      <section style={card}>
        <h2 style={h2}>Open ({open.length})</h2>
        {open.length === 0 ? (
          <Empty>{filtering ? "No open tasks match those filters." : "Nothing open. Nice work."}</Empty>
        ) : (
          <ul style={list}>{open.map((t) => <TaskRow key={t.id} t={t} next={next} />)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <section style={{ ...card, marginTop: "1rem", opacity: 0.8 }}>
          <h2 style={h2}>Completed ({done.length})</h2>
          <ul style={list}>{done.map((t) => <TaskRow key={t.id} t={t} next={next} />)}</ul>
        </section>
      )}
    </div>
  );
}

function TaskRow({ t, next }: { t: TaskWithRefs; next: string }) {
  const isDone = t.status === "done";
  const overdue = !isDone && isOverdue(t.due_at, t.due_time);
  const time = fmtTime(t.due_time);
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", padding: ".6rem 0", borderTop: "1px solid #f1f2f1" }}>
      <form action={toggleTaskAction} style={{ marginTop: ".1rem" }}>
        <input type="hidden" name="taskId" value={t.id} />
        <input type="hidden" name="status" value={isDone ? "open" : "done"} />
        <input type="hidden" name="next" value={next} />
        <button type="submit" title={isDone ? "Reopen" : "Mark done"} style={{ ...checkbox, background: isDone ? "var(--brand)" : "#fff", color: "#fff" }}>{isDone ? "✓" : ""}</button>
      </form>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".45rem", flexWrap: "wrap" }}>
          {t.type && <span style={typeBadge}>{TASK_TYPE_LABELS[t.type] ?? t.type}</span>}
          <span style={{ fontWeight: 500, textDecoration: isDone ? "line-through" : "none", color: isDone ? "#999" : "inherit" }}>{t.title}</span>
        </div>
        <div style={{ fontSize: ".8rem", color: "#888", display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: ".15rem" }}>
          {t.due_at && (
            <span style={{ color: overdue ? "#9b1c1c" : "#888", fontWeight: overdue ? 600 : 400 }}>
              {overdue ? "Overdue · " : "Due "}{fmtDate(t.due_at)}{time ? ` at ${time}` : ""}
            </span>
          )}
          {t.constituent_name && t.constituent_id && <Link href={`/app/constituents/${t.constituent_id}`} style={{ color: "var(--brand)" }}>{t.constituent_name}</Link>}
          {t.assignee_name || t.assignee_email ? <span>· {t.assignee_name || t.assignee_email}</span> : null}
        </div>
        {t.notes && <p style={{ fontSize: ".82rem", color: "#666", margin: ".25rem 0 0" }}>{t.notes}</p>}
      </div>
      <form action={deleteTaskAction}>
        <input type="hidden" name="taskId" value={t.id} />
        <input type="hidden" name="next" value={next} />
        <button type="submit" style={linkBtn}>delete</button>
      </form>
    </li>
  );
}

/**
 * Overdue = the due moment has passed. A date with no time is only overdue once
 * the whole day has gone by, so "due today, no time" doesn't nag from midnight.
 */
function isOverdue(dueAt: Date | null, dueTime: string | null): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  const m = dueTime ? /^(\d{1,2}):(\d{2})/.exec(dueTime) : null;
  if (m) due.setHours(Number(m[1]), Number(m[2]), 0, 0);
  else due.setHours(23, 59, 59, 999);
  return due < new Date();
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "#999", fontSize: ".9rem", margin: 0 }}>{children}</p>;
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem" };
const h2: React.CSSProperties = { fontSize: "1rem", margin: "0 0 .6rem" };
const list: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0 };
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 8, fontSize: ".9rem", background: "#fff", width: "100%", boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "grid", gap: ".25rem", fontSize: ".78rem", color: "#777" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "#fff", color: "var(--brand)", border: "1px solid var(--brand)", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
const checkbox: React.CSSProperties = { width: 20, height: 20, borderRadius: 5, border: "1.5px solid var(--brand)", cursor: "pointer", fontSize: ".75rem", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#9b1c1c", cursor: "pointer", fontSize: ".8rem" };
const typeBadge: React.CSSProperties = { fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--brand)", background: "var(--parchment-deep)", border: "1px solid var(--app-border)", borderRadius: 999, padding: ".1rem .5rem", whiteSpace: "nowrap" };
