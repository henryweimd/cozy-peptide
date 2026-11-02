-- CRO image checks for cozy-peptide: SAM segmentation persisted per analysis.
-- Additive only: one new table, two indexes, one public-read bucket.
--
-- Note: run_id is uuid (not text) because Postgres cannot foreign-key a
-- text column to peptide_runs(id uuid); the FK keeps cascade behavior
-- identical to assay_results. Nullable: ephemeral checks without a run.

create table if not exists public.cro_image_analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid references public.peptide_runs (id) on delete cascade,
  image_path text not null,
  concepts text[] not null default '{}',
  sam_model text not null default 'sam-3.1',
  boxes jsonb not null default '[]'::jsonb,
  masks jsonb not null default '[]'::jsonb,
  foreground_pixels integer not null default 0,
  count integer not null default 0,
  mask_svg text not null default '',
  summary jsonb not null default '{}'::jsonb
);

create index if not exists cro_image_analyses_run_id_idx
  on public.cro_image_analyses (run_id);

create index if not exists cro_image_analyses_created_at_idx
  on public.cro_image_analyses (created_at desc);

alter table public.cro_image_analyses enable row level security;
-- No public policies: server-only access via the service role.

insert into storage.buckets (id, name, public)
values ('cro-images', 'cro-images', true)
on conflict (id) do update set public = true;

drop policy if exists "cro-images public read" on storage.objects;
create policy "cro-images public read"
  on storage.objects for select
  using (bucket_id = 'cro-images');
