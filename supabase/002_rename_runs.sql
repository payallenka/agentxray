-- Run titles are user-assigned, so members need UPDATE on runs.
-- The base schema only granted select / insert / delete, which would make a
-- rename fail silently: RLS returns zero rows updated rather than an error.

drop policy if exists runs_update on runs;
create policy runs_update on runs
  for update
  using      (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
