-- Literature citations + cached report narrative for cozy-peptide.
-- Run once in the Supabase SQL editor (project ujmhuapwuflcplmimckm).

-- First-class citation records per run (URLs/titles preserved).
create table if not exists public.research_citations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.peptide_runs(id) on delete cascade,
  source text not null,
  external_id text not null,
  title text not null default '',
  snippet text not null default '',
  url text not null default '',
  year text,
  created_at timestamptz not null default now(),
  unique (run_id, source, external_id)
);

create index if not exists research_citations_run_idx
  on public.research_citations (run_id, created_at);

alter table public.research_citations enable row level security;

-- Reads: same posture as peptide_runs ledger.
drop policy if exists "citations_read_all" on public.research_citations;
create policy "citations_read_all"
  on public.research_citations for select
  to anon, authenticated
  using (true);

-- Writes: service role only (bypasses RLS by default).
drop policy if exists "citations_insert_service" on public.research_citations;
create policy "citations_insert_service"
  on public.research_citations for insert
  to authenticated
  with check (false);

-- Cached Spark-synthesized report narrative {model, at, narrative}.
alter table public.peptide_runs
  add column if not exists research_narrative jsonb;
