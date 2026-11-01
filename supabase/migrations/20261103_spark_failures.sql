-- Failed outbound Spark calls for cozy-peptide.
-- Additive only: one nullable jsonb column, nothing else touched.

alter table public.peptide_runs
  add column if not exists spark_failures jsonb;
