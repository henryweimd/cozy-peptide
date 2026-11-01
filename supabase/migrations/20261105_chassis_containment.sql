-- Chassis compatibility and biocontainment trail for cozy-peptide.
-- Run once in the Supabase SQL editor (project ujmhuapwuflcplmimckm).
-- Additive only: two nullable jsonb columns, nothing else touched.

alter table public.peptide_runs
  add column if not exists chassis jsonb;

alter table public.peptide_runs
  add column if not exists biocontainment jsonb;
