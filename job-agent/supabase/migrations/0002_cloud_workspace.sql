-- One authenticated, versioned workspace document per account.
-- The API validates every field before writing, while RLS isolates rows by auth.uid().
create table if not exists public.job_agent_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  profile jsonb not null,
  saved_jobs jsonb not null default '[]'::jsonb,
  applications jsonb not null default '[]'::jsonb,
  saved_searches jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint job_agent_workspaces_profile_object
    check (jsonb_typeof(profile) = 'object'),
  constraint job_agent_workspaces_saved_jobs_array
    check (case when jsonb_typeof(saved_jobs) = 'array'
      then jsonb_array_length(saved_jobs) <= 100 else false end),
  constraint job_agent_workspaces_applications_array
    check (case when jsonb_typeof(applications) = 'array'
      then jsonb_array_length(applications) <= 100 else false end),
  constraint job_agent_workspaces_saved_searches_array
    check (case when jsonb_typeof(saved_searches) = 'array'
      then jsonb_array_length(saved_searches) <= 20 else false end),
  constraint job_agent_workspaces_payload_size
    check (pg_column_size(profile) + pg_column_size(saved_jobs)
      + pg_column_size(applications) + pg_column_size(saved_searches) <= 4194304)
);

alter table public.job_agent_workspaces enable row level security;

drop policy if exists "Users can read own Job Agent workspace" on public.job_agent_workspaces;
create policy "Users can read own Job Agent workspace"
  on public.job_agent_workspaces for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own Job Agent workspace" on public.job_agent_workspaces;
create policy "Users can insert own Job Agent workspace"
  on public.job_agent_workspaces for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own Job Agent workspace" on public.job_agent_workspaces;
create policy "Users can update own Job Agent workspace"
  on public.job_agent_workspaces for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own Job Agent workspace" on public.job_agent_workspaces;
create policy "Users can delete own Job Agent workspace"
  on public.job_agent_workspaces for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.job_agent_workspaces from anon;
grant select, insert, update, delete on table public.job_agent_workspaces to authenticated;

comment on table public.job_agent_workspaces is
  'Private per-user Job Agent workspace snapshot. All reads and writes are restricted by RLS to auth.uid().';
