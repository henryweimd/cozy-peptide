-- Precomputed literature briefs per disease target for cozy-peptide.
-- Run once in the Supabase SQL editor (project ujmhuapwuflcplmimckm).
-- The seed script fills one row per preset objective; live runs reuse
-- fresh rows and refresh them when synthesis succeeds.

create table if not exists public.research_briefs (
  target_key text primary key,
  target_display text not null default '',
  status text not null default 'fallback',
  brief jsonb,
  evidence jsonb not null default '[]'::jsonb,
  model text not null default '',
  retrieved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.research_briefs enable row level security;

-- Reads: public briefs, same posture as the citations ledger.
drop policy if exists "briefs_read_all" on public.research_briefs;
create policy "briefs_read_all"
  on public.research_briefs for select
  to anon, authenticated
  using (true);

-- Writes: service role only (bypasses RLS by default).
drop policy if exists "briefs_insert_service" on public.research_briefs;
create policy "briefs_insert_service"
  on public.research_briefs for insert
  to authenticated
  with check (false);

drop policy if exists "briefs_update_service" on public.research_briefs;
create policy "briefs_update_service"
  on public.research_briefs for update
  to authenticated
  using (false);
