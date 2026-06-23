-- ============================================================
-- 0012_interactions_tasks.sql  ·  Contact management: interactions + tasks.
--
-- LGL-parity "Contact Management" pillar. An interaction is a logged touch with a
-- constituent (call/email/meeting/note, plus auto-logged Tidings sends) forming a
-- per-constituent timeline. A task is a to-do, optionally tied to a constituent,
-- with a due date and assignee, for the org-wide Tasks list. Both org-scoped.
-- ============================================================

create table interactions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  constituent_id uuid not null references constituents(id) on delete cascade,
  type           text not null,          -- call | email | meeting | note | text | mailing
  subject        text,
  body           text,
  occurred_at    timestamptz not null default now(),
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index interactions_constituent_idx on interactions (org_id, constituent_id, occurred_at desc);

create table tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  constituent_id uuid references constituents(id) on delete cascade,
  title          text not null,
  notes          text,
  due_at         date,
  status         text not null default 'open',   -- open | done
  assigned_to    uuid references users(id) on delete set null,
  completed_at   timestamptz,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tasks_org_status_due_idx on tasks (org_id, status, due_at);
create index tasks_constituent_idx on tasks (org_id, constituent_id);
