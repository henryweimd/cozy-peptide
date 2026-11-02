-- Segmentation cache key for CRO image checks: repeat analyses of the
-- same pixels + concept reload the stored segmentation instead of
-- calling the model again. Additive only; old rows without a hash
-- simply never match and re-segment once.

alter table public.cro_image_analyses
  add column if not exists image_sha256 text;

create index if not exists cro_image_analyses_sha_idx
  on public.cro_image_analyses (image_sha256);
