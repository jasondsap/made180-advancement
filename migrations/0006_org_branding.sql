-- ============================================================
-- 0006_org_branding.sql  ·  Per-tenant branding on the public surface.
--
-- The platform shell is "Almonry"; each tenant org carries its own identity on
-- its public giving page (/give/[slug]) and tax receipts. Both columns are
-- optional — when null, the page/receipt falls back to the Almonry default.
--   logo_url       : absolute URL to the org's logo (shown on the giving page)
--   primary_color  : hex (e.g. '#1c6e3c') used as the accent / button color
-- ============================================================

alter table orgs add column logo_url text;
alter table orgs add column primary_color text;
