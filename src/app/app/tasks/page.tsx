import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { listTasks } from "@/repositories/tasks";
import { listMembersForOrg } from "@/repositories/users";
import { fmtDate } from "@/lib/format";
import type { TaskWithRefs } from "@/types/db";
import { createTaskAction, toggleTaskAction, deleteTaskAction } from "./actions";

export const dynamic = "force-dynamic";

const NEXT = "/app/tasks";

export default async function TasksPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const [tasks, members] = await Promise.all([
    listTasks(ctx.orgId),
    listMembersForOrg(ctx.orgId),
  ]);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const memberName = (m: { name: string | null; email: string }) => m.name || m.email;

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: "1.6rem", margin: "0 0 .25rem" }}>Tasks</h1>
      <p style={{ color: "var(--app-text-soft)", fontSize: ".9rem", margin: "0 0 1.25rem" }}>
        Follow-ups and to-dos. Overdue items are flagged. Link a task to a constituent from their page.
      </p>

      {/* New task */}
      <section style={{ ...card, marginBottom: "1.5rem" }}>
        <h2 style={h2}>Add a task</h2>
        <form action={createTaskAction} style={{ display: "grid", gap: ".6rem", gridTemplateColumns: "1fr", maxWidth: 560 }}>
          <input type="hidden" name="next" value={NEXT} />
          <input name="title" placeholder="Call Jane about year-end gift" style={inp} required />
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <label style={lbl}>Due
              <input type="date" name="dueAt" style={inp} />
            </label>
            <label style={lbl}>Assign to
              <select name="assignedTo" style={inp}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
              </select>
            </label>
          </div>
          <textarea name="notes" placeholder="Notes (optional)" style={{ ...inp, minHeight: 60 }} />
          <div><button style={btnPrimary}>Add task</button></div>
        </form>
      </section>

      <section style={card}>
        <h2 style={h2}>Open ({open.length})</h2>
        {open.length === 0 ? <Empty>Nothing open. Nice work.</Empty> : (
          <ul style={list}>{open.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <section style={{ ...card, marginTop: "1rem", opacity: 0.8 }}>
          <h2 style={h2}>Completed ({done.length})</h2>
          <ul style={list}>{done.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
        </section>
      )}
    </div>
  );
}

function TaskRow({ t }: { t: TaskWithRefs }) {
  const isDone = t.status === "done";
  const overdue = !isDone && t.due_at != null && new Date(t.due_at) < startOfToday();
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", padding: ".6rem 0", borderTop: "1px solid #f1f2f1" }}>
      <form action={toggleTaskAction} style={{ marginTop: ".1rem" }}>
        <input type="hidden" name="taskId" value={t.id} />
        <input type="hidden" name="status" value={isDone ? "open" : "done"} />
        <input type="hidden" name="next" value={NEXT} />
        <button type="submit" title={isDone ? "Reopen" : "Mark done"} style={{ ...checkbox, background: isDone ? "var(--brand)" : "#fff", color: "#fff" }}>{isDone ? "✓" : ""}</button>
      </form>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, textDecoration: isDone ? "line-through" : "none", color: isDone ? "#999" : "inherit" }}>{t.title}</div>
        <div style={{ fontSize: ".8rem", color: "#888", display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: ".15rem" }}>
          {t.due_at && <span style={{ color: overdue ? "#9b1c1c" : "#888", fontWeight: overdue ? 600 : 400 }}>{overdue ? "Overdue · " : "Due "}{fmtDate(t.due_at)}</span>}
          {t.constituent_name && t.constituent_id && <Link href={`/app/constituents/${t.constituent_id}`} style={{ color: "var(--brand)" }}>{t.constituent_name}</Link>}
          {t.assignee_name || t.assignee_email ? <span>· {t.assignee_name || t.assignee_email}</span> : null}
        </div>
        {t.notes && <p style={{ fontSize: ".82rem", color: "#666", margin: ".25rem 0 0" }}>{t.notes}</p>}
      </div>
      <form action={deleteTaskAction}>
        <input type="hidden" name="taskId" value={t.id} />
        <input type="hidden" name="next" value={NEXT} />
        <button type="submit" style={linkBtn}>delete</button>
      </form>
    </li>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
const checkbox: React.CSSProperties = { width: 20, height: 20, borderRadius: 5, border: "1.5px solid var(--brand)", cursor: "pointer", fontSize: ".75rem", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#9b1c1c", cursor: "pointer", fontSize: ".8rem" };
