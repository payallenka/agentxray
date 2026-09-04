-- Server-side filtering needs real columns, not JSON.
--
-- Two problems this fixes:
--   1. created_at is when a run was *ingested*, not when the agent actually
--      ran. Every time filter was therefore filtering on import time, which
--      made "last 24 hours" match a backfill of three weeks of history.
--   2. Session, user and environment lived inside the analysis JSON, so they
--      could only be filtered after fetching every row into the browser.

create extension if not exists pg_trgm;

alter table runs add column if not exists started_at  timestamptz;
alter table runs add column if not exists session_id  text;
alter table runs add column if not exists actor_id    text;   -- the end user, not our auth user
alter table runs add column if not exists environment text;
-- which kinds of finding this run has, so a cohort filter is one indexed
-- lookup instead of fetching every row and filtering in the browser
alter table runs add column if not exists categories  text[] default '{}';

-- existing rows: the best available approximation is when we ingested them
update runs set started_at = created_at where started_at is null;

-- lift what earlier ingests already stored inside the analysis blob
update runs
   set session_id  = coalesce(session_id,  analysis->'attributes'->>'session'),
       actor_id    = coalesce(actor_id,    analysis->'attributes'->>'user'),
       environment = coalesce(environment, analysis->'attributes'->>'environment')
 where analysis ? 'attributes';

-- the queries the runs list actually issues
create index if not exists runs_org_started_idx on runs (org_id, started_at desc);
create index if not exists runs_org_session_idx on runs (org_id, session_id);
create index if not exists runs_org_env_idx     on runs (org_id, environment);
create index if not exists runs_org_cost_idx    on runs (org_id, cost_usd desc);
create index if not exists runs_org_waste_idx   on runs (org_id, waste_usd desc);

-- free-text search across the fields a person actually remembers
create index if not exists runs_name_trgm_idx on runs using gin (name gin_trgm_ops);
create index if not exists runs_categories_idx on runs using gin (categories);
