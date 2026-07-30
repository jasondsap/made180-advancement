-- ============================================================
-- 0023_task_type_and_time.sql  ·  Tasks: activity type + time-of-day.
--
-- `type` classifies the follow-up (call | email | letter | visit | meeting |
-- thank_you | proposal | research | other). Free text rather than an enum so the
-- list can grow in TS (TASK_TYPES) without a migration. Nullable: tasks created
-- before this migration have no type, and type stays optional on the form.
--
-- `due_time` is the optional time-of-day paired with the existing `due_at` date.
-- Deliberately `time` (no zone), NOT a timestamptz: we have no per-org timezone
-- anywhere in the schema, and the app runs UTC on Amplify — folding a date into a
-- timestamptz would render "9:00 AM" as the previous evening for a US org. Date +
-- wall-clock time is what a gift officer means by "Tuesday at 2pm", and it round-
-- trips through <input type="time"> unchanged.
-- ============================================================

alter table tasks add column type      text;
alter table tasks add column due_time  time;

-- Sorting/filtering the org-wide Tasks list by type.
create index tasks_org_type_idx on tasks (org_id, type);

-- The list orders by due_at then due_time; widen the existing due index to match.
create index tasks_org_status_due_time_idx on tasks (org_id, status, due_at, due_time);
