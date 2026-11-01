-- Wet-lab loop intake for cozy-peptide: assay results keyed to runs.
-- Additive only: one new table, two indexes, one private bucket.

create table if not exists public.assay_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.peptide_runs (id) on delete cascade,
  assay_type text not null check (
    assay_type in (
      'mic',
      'cytotoxicity',
      'expression_titer',
      'sequence_verification'
    )
  ),
  template_version text not null,
  organism_or_cells text,
  value_num double precision,
  value_unit text,
  value_text text,
  passed boolean,
  measurements jsonb not null default '[]'::jsonb,
  raw_file_name text,
  raw_storage_path text,
  raw_body_base64 text,
  notes text,
  consent_community boolean not null default false,
  consent_license text not null default 'CC0'
);

create index if not exists assay_results_run_id_idx
  on public.assay_results (run_id);

create index if not exists assay_results_community_idx
  on public.assay_results (created_at)
  where consent_community is true;

alter table public.assay_results enable row level security;
-- No public policies: server-only access via the service role.

insert into storage.buckets (id, name, public)
values ('assay-raw', 'assay-raw', false)
on conflict (id) do nothing;
