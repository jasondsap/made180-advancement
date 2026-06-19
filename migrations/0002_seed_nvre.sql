-- ============================================================
-- 0002_seed_nvre.sql  ·  Seed first tenant: New Vision Renewable Energy
-- ============================================================

insert into orgs (slug, legal_name, ein, receipt_from_email, receipt_signature_name, address_json)
values (
  'nvre',
  'New Vision Renewable Energy',
  '45-4696610',
  'donate@nvre.org',                       -- TODO confirm reply-to with Lauren
  'Ruston Seaman, Executive Director',     -- TODO confirm signatory
  '{}'::jsonb                              -- TODO add mailing address for receipt letterhead
)
on conflict (slug) do nothing;

-- Funds mirror NVRE's donate-page giving paths
insert into funds (org_id, code, name, restricted)
select o.id, f.code, f.name, f.restricted
from orgs o
cross join (values
  ('general',     'Where Needed Most',            false),
  ('village',     'New Vision Village',           true),
  ('workforce',   'Workforce Development',        true),
  ('ray_of_life', 'Ray of Life Solar Outreach',   true)
) as f(code, name, restricted)
where o.slug = 'nvre'
on conflict (org_id, code) do nothing;
