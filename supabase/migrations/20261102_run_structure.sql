-- ESMFold predicted structures for cozy-peptide.
-- Run once in the Supabase SQL editor (project ujmhuapwuflcplmimckm).
-- Additive only: three nullable columns, nothing else touched.

alter table public.peptide_runs
  add column if not exists structure_pdb text;

alter table public.peptide_runs
  add column if not exists structure_plddt double precision;

alter table public.peptide_runs
  add column if not exists structure_predicted_at timestamptz;
