-- ============================================================
-- 0021_registrant_checkin.sql  ·  Event day check-in.
--
-- One timestamp per registrant line; null = not arrived. The registrants admin
-- page becomes the (mobile-friendly) check-in surface: search by name/email,
-- tap to check in/undo.
-- ============================================================

alter table registrants add column checked_in_at timestamptz;
