-- Crux research projects. Run once in the Supabase SQL editor (or `supabase db push`).
-- The app reads and writes with the project's secret key on the server only.

create table if not exists public.projects (
  id uuid primary key,
  question text not null,
  status text not null check (status in ('running', 'complete', 'failed')),
  mode text not null check (mode in ('live', 'mock')),
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  -- The full ResearchProject: research, thesis, stress test, re-evaluation, conclusion, audit.
  data jsonb not null
);

create index if not exists projects_created_at_idx on public.projects (created_at desc);

-- Row-level security on with no policies: the public (anon) key can't read or write
-- anything, only the server's secret key can.
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, insert, update, delete on public.projects to service_role;
