-- ============================================================
-- 0019_org_features.sql  ·  Per-org feature entitlements.
--
-- Env flags (ENGAGE_SMS_ENABLED etc.) say what the PLATFORM has provisioned;
-- orgs.features says what a given tenant is entitled to. Effective flag =
-- env flag AND (features->>key is not 'false'). NULL / missing key = entitled,
-- so existing single-tenant behavior is unchanged until an admin toggles.
-- ============================================================

alter table orgs add column features jsonb;
