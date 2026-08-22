-- Agent X-Ray · multi-tenant schema
-- Tenant isolation is enforced by Row Level Security, not by application code.

create extension if not exists pgcrypto;

/* ------------------------------- tenants ------------------------------- */

create table if not exists orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists memberships (
  org_id   uuid not null references orgs(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists memberships_user_idx on memberships(user_id);

/* -------------------------------- runs --------------------------------- */

create table if not exists runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  name          text not null,
  source        text not null,
  -- headline metrics, kept as columns so the history list is one cheap query
  span_count    int  not null default 0,
  total_ms      double precision not null default 0,
  cost_usd      double precision not null default 0,
  waste_usd     double precision not null default 0,
  waste_share   double precision not null default 0,
  cp_share      double precision not null default 0,
  finding_count int  not null default 0,
  -- redacted by default: prompt/completion text is stripped client-side
  redacted      boolean not null default true,
  spans         jsonb not null,
  analysis      jsonb not null,
  created_at    timestamptz not null default now()
);

create index if not exists runs_org_created_idx on runs(org_id, created_at desc);

/* ---------------------------- ingest api keys --------------------------- */

create table if not exists api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null default 'default',
  -- only the sha256 of the key is stored; the plaintext is shown once
  key_hash    text not null unique,
  key_prefix  text not null,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists api_keys_hash_idx on api_keys(key_hash);

/* --------------------------------- RLS ---------------------------------- */

alter table orgs        enable row level security;
alter table memberships enable row level security;
alter table runs        enable row level security;
alter table api_keys    enable row level security;

-- security definer avoids infinite recursion: the memberships policy cannot
-- itself query memberships through RLS
create or replace function public.user_org_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from memberships where user_id = auth.uid()
$$;

drop policy if exists orgs_read on orgs;
create policy orgs_read on orgs
  for select using (id in (select public.user_org_ids()));

drop policy if exists orgs_insert on orgs;
create policy orgs_insert on orgs
  for insert with check (auth.uid() is not null);

drop policy if exists memberships_read on memberships;
create policy memberships_read on memberships
  for select using (user_id = auth.uid() or org_id in (select public.user_org_ids()));

drop policy if exists memberships_insert on memberships;
create policy memberships_insert on memberships
  for insert with check (
    user_id = auth.uid()                                  -- claiming your own seat
    or org_id in (                                        -- or an owner inviting
      select org_id from memberships
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

drop policy if exists runs_read on runs;
create policy runs_read on runs
  for select using (org_id in (select public.user_org_ids()));

drop policy if exists runs_insert on runs;
create policy runs_insert on runs
  for insert with check (org_id in (select public.user_org_ids()));

drop policy if exists runs_delete on runs;
create policy runs_delete on runs
  for delete using (org_id in (select public.user_org_ids()));

drop policy if exists api_keys_read on api_keys;
create policy api_keys_read on api_keys
  for select using (org_id in (select public.user_org_ids()));

drop policy if exists api_keys_write on api_keys;
create policy api_keys_write on api_keys
  for all using (
    org_id in (select org_id from memberships
               where user_id = auth.uid() and role in ('owner','admin'))
  );

/* ------------------- every new user gets a personal org ------------------ */

create or replace function public.bootstrap_org_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
  base    text;
begin
  base := split_part(coalesce(new.email, 'team'), '@', 1);
  insert into orgs (name, slug)
    values (base || '''s workspace', base || '-' || substr(new.id::text, 1, 8))
    returning id into new_org;
  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.bootstrap_org_for_user();
