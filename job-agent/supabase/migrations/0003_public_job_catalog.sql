-- Extend the shared catalog for search/filtering and expose only public active listings.
-- Provider configuration remains private; only the explicitly granted metadata columns are readable.

alter table public.jobs add column if not exists salary_text text;
alter table public.jobs add column if not exists category text;
alter table public.jobs add column if not exists job_type text;

alter table public.jobs
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(company_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(skills, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(location_text, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(job_type, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(salary_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) stored;

create index if not exists jobs_search_vector_idx
  on public.jobs using gin (search_vector);
create index if not exists jobs_source_last_seen_idx
  on public.jobs (source_id, last_seen_at desc);
create index if not exists job_sources_enabled_key_idx
  on public.job_sources (source_key) where enabled = true;

drop policy if exists "Authenticated users can read active unexpired jobs" on public.jobs;
drop policy if exists "Public can read active unexpired jobs" on public.jobs;
create policy "Public can read active unexpired jobs"
  on public.jobs for select to anon, authenticated
  using (active = true and (expires_at is null or expires_at > now()));

grant select on public.jobs to anon, authenticated;

drop policy if exists "Public can read enabled job source metadata" on public.job_sources;
create policy "Public can read enabled job source metadata"
  on public.job_sources for select to anon, authenticated
  using (enabled = true);

-- Revoke broad table privileges and expose only metadata needed for public catalog joins.
revoke all on table public.job_sources from anon, authenticated;
grant select (id, source_key, display_name, source_type, enabled, last_checked_at)
  on public.job_sources to anon, authenticated;

comment on column public.jobs.search_vector is
  'Generated search document for public catalog lookups; indexed by GIN and recomputed by PostgreSQL.';
