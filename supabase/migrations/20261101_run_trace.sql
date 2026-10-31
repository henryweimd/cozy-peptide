-- Step-by-step pipeline trace + specificity review for cozy-peptide.
-- Run once in the Supabase SQL editor (project ujmhuapwuflcplmimckm).
-- Additive only: two nullable jsonb columns, nothing else touched.

alter table public.peptide_runs
  add column if not exists stage_trace jsonb;

alter table public.peptide_runs
  add column if not exists specificity jsonb;
