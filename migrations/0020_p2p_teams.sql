-- ============================================================
-- 0020_p2p_teams.sql  ·  Team peer-to-peer fundraising.
--
-- A team groups p2p_members under a parent fundraiser; team totals are DERIVED
-- from member-attributed gifts (same no-counters rule as fundraisers/members).
-- Members may be teamless (team_id null). Teams are created on the fly during
-- the public join flow (get-or-create by name, case-insensitive).
-- ============================================================

create table p2p_teams (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  fundraiser_id uuid not null references fundraisers(id) on delete cascade,
  name          text not null,
  goal_cents    integer,
  created_at    timestamptz not null default now()
);
create unique index p2p_teams_fundraiser_name_uniq on p2p_teams (fundraiser_id, lower(name));
create index p2p_teams_org_idx on p2p_teams (org_id);

alter table p2p_members add column team_id uuid references p2p_teams(id) on delete set null;
create index p2p_members_team_idx on p2p_members (team_id) where team_id is not null;
