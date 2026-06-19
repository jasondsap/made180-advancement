-- ============================================================
-- 0004_seed_super_admin.sql  ·  Bootstrap the platform super_admin.
--
-- cognito_sub is a sentinel until first login. The auth layer reconciles it to
-- the real Cognito `sub` by matching email on the first authenticated request,
-- then this row owns that identity. super_admin is cross-org (no membership row
-- needed); org_admin/org_staff access is granted via memberships.
-- ============================================================

insert into users (cognito_sub, email, name, is_super_admin)
values ('seed-pending:jason@made180.com', 'jason@made180.com', 'Jason', true)
on conflict (cognito_sub) do nothing;
