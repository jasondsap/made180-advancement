-- ============================================================
-- 0007_engage.sql  ·  Engage module (donor messaging: email/SMS/mail).
--
-- Every table is org-scoped (org_id NOT NULL → orgs, cascade). Channels share
-- one message + recipient model; mailings are messages with channel='mail'.
-- Consent columns on constituents enforce CAN-SPAM (email opt-out) and TCPA
-- (SMS opt-in) at audience-resolution time; do_not_contact is always honored.
-- ============================================================

-- ---------- consent (on the existing constituents spine) ----------
alter table constituents add column email_opt_out boolean not null default false;
alter table constituents add column sms_opt_in    boolean not null default false;

-- ---------- sending domains (Resend) ----------
create table engage_domains (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  domain           text not null,
  verified         boolean not null default false,
  dns_records      jsonb,                 -- [{type,host,value,verified}]
  resend_domain_id text,
  created_at       timestamptz not null default now()
);
create unique index engage_domains_org_domain_uniq on engage_domains (org_id, lower(domain));
create index engage_domains_org_idx on engage_domains (org_id);

-- ---------- senders (from name/email; must sit on a verified domain) ----------
create table engage_senders (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  domain_id   uuid references engage_domains(id) on delete set null,
  from_name   text not null,
  from_email  text not null,
  reply_to    text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index engage_senders_org_idx on engage_senders (org_id);
-- At most one default sender per org.
create unique index engage_senders_one_default
  on engage_senders (org_id) where is_default;

-- ---------- saved addresses (org + mailing/return) ----------
create table engage_addresses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  type        text not null,             -- 'organization' | 'mailing_return'
  line1       text not null,
  line2       text,
  city        text not null,
  state       text not null,
  postal_code text not null,
  country     text not null default 'US',
  created_at  timestamptz not null default now()
);
create index engage_addresses_org_idx on engage_addresses (org_id);

-- ---------- merge fields (variables resolved against a constituent) ----------
create table engage_merge_fields (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  name          text not null,
  tag           text not null,           -- '{{contact.primary_email}}'
  default_value text,
  created_at    timestamptz not null default now()
);
create unique index engage_merge_fields_org_tag_uniq on engage_merge_fields (org_id, tag);

-- ---------- messages (one row per email/SMS/mailing campaign) ----------
create table engage_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  channel         text not null,         -- 'email' | 'sms' | 'mail'
  name            text not null,
  subject         text,                  -- email only
  body_md         text,                  -- markdown/plaintext body w/ merge tags
  sender_id       uuid references engage_senders(id) on delete set null,
  audience_json   jsonb,                 -- filter spec (resolved at send)
  recipient_count integer not null default 0,
  status          text not null default 'draft', -- draft|scheduled|sending|sent|failed
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index engage_messages_org_idx on engage_messages (org_id, channel, status);

create trigger engage_messages_set_updated_at
  before update on engage_messages
  for each row execute function set_updated_at();

-- ---------- recipients (per-send fan-out + delivery tracking) ----------
create table engage_recipients (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id) on delete cascade,
  message_id          uuid not null references engage_messages(id) on delete cascade,
  constituent_id      uuid references constituents(id) on delete set null,
  to_email            text,
  to_phone            text,
  provider_message_id text,              -- Resend/Twilio id, for webhook matching
  status              text not null default 'queued', -- queued|sent|delivered|opened|clicked|bounced|failed|unsubscribed
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index engage_recipients_message_idx on engage_recipients (message_id);
create index engage_recipients_org_idx on engage_recipients (org_id);
-- One row per (message, constituent) so resends/replays don't duplicate.
create unique index engage_recipients_msg_con_uniq
  on engage_recipients (message_id, constituent_id) where constituent_id is not null;
-- Webhooks match on the provider id.
create index engage_recipients_provider_idx
  on engage_recipients (provider_message_id) where provider_message_id is not null;

create trigger engage_recipients_set_updated_at
  before update on engage_recipients
  for each row execute function set_updated_at();
