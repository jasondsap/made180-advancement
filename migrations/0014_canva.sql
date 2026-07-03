-- ============================================================
-- 0014_canva.sql  ·  Canva Connect integration (design-with-Canva images).
--
-- - canva_connections: per-USER OAuth tokens. Documented exception to the
--   org_id invariant (same class as users.ts): a Canva account belongs to a
--   person, and platform users span orgs via memberships. Tokens are
--   aes-256-gcm encrypted at rest (src/lib/crypto.ts). token_version is the
--   optimistic-concurrency guard for Canva's SINGLE-USE refresh tokens
--   (Neon HTTP driver = no interactive transactions / row locks).
-- - canva_media: org-scoped record of every image exported from Canva.
--   s3_key is STABLE for the life of the row — the Edit-in-Canva round trip
--   re-exports and OVERWRITES the same object, so URLs already stored in
--   campaigns.cover_image_url / orgs.logo_url / fundraisers.theme_json /
--   email bodies never need rewriting. target_kind/target_id are provenance
--   + drive the post-edit redirect. id is generated app-side (it is embedded
--   in s3_key before insert).
-- ============================================================

create table canva_connections (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references users(id) on delete cascade,
  canva_user_id            text not null,          -- Canva user id (users/me); cross-checked vs correlation_jwt.sub
  display_name             text,                   -- profile:read; shown in Settings
  access_token_enc         text not null,          -- aes-256-gcm: base64url(iv|tag|ciphertext)
  refresh_token_enc        text not null,
  access_token_expires_at  timestamptz not null,
  scopes                   text not null,
  token_version            integer not null default 1,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger canva_connections_set_updated_at
  before update on canva_connections
  for each row execute function set_updated_at();

create table canva_media (
  id               uuid primary key,
  org_id           uuid not null references orgs(id) on delete cascade,
  canva_design_id  text not null,
  s3_key           text not null,
  url              text not null,
  target_kind      text not null,  -- 'campaign_cover' | 'org_logo' | 'fundraiser_cover' | 'email_inline'
  target_id        uuid,           -- campaigns.id / orgs.id / fundraisers.id / engage_messages.id; null if placed before the target row exists
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index canva_media_org_idx     on canva_media (org_id, created_at desc);
create index canva_media_org_url_idx on canva_media (org_id, url);
create trigger canva_media_set_updated_at
  before update on canva_media
  for each row execute function set_updated_at();
