# Architecture

Next.js 16 app (TypeScript) + Supabase ledger + Python `ml/` training
subproject. One repo, three pages, one pipeline.

## Request flow

`POST /api/generate-peptide` (streaming or buffered) drives
`generateVerifiedPeptide()` in `lib/meta-spark.ts`:

1. **Intake guard** — `lib/target-guard.ts`, `lib/gut-targets.ts`,
   `lib/biosecurity.ts`. Refuses toxins, venoms, select agents,
   harm-optimization, and unreachable sites before any model call.
2. **Research brief** — `lib/research/`, `lib/prompt-steering.ts`.
   Mines PubMed/Europe PMC to ground the prompt in literature.
3. **Modality + chassis** — `lib/modality.ts` (7 scaffolds, Auto
   default), `lib/hosts.ts` + `lib/chassis-compat.ts` (4 hosts scored
   on secretion, burden, processing).
4. **Ideation** — Muse Spark via Meta Model API
   (`lib/spark-client.ts`, `lib/spark-config.ts`) proposes candidates.
5. **Compile + repair** — `lib/symbolic-auditor.ts` and
   `lib/protein-grammar.ts` accept or return diagnostics; Spark
   repairs in a closed loop. Fallback sampler covers API outages.
6. **Review** — blinded specificity check (`lib/specificity.ts`),
   therapeutic index (`lib/therapeutic-index.ts`), agent tools
   (`lib/agent-tools.ts`).
7. **Factory plan** — codon optimization (`lib/codon-optimizer.ts`),
   containment (`lib/biocontainment.ts`), vendor handoff
   (`lib/lab-handoff.ts`, `lib/providers.ts`).
8. **Ledger** — every run, success or failure, persists to Supabase
   (`lib/db/`, `supabase/migrations/`).

## Web surfaces

- `/` — landing: live demo, pipeline primer, safety, latest design.
- `/design` — full designer: condition grid, live status, 3D structure
  (`lib/esmfold.ts`), downloads, Recent-designs ledger, Pep tour.
- `/lab-guide` — wet-lab companion: tracked bench steps, template
  downloads, token-gated uploads, demo mode, CRO photo check.
- `/api/*` — programmatic everything: design, audit, modalities,
  hosts, assay templates/results/export, lab dispatch, image analysis.

## Lab loop

Assays in (`assay-ingest.ts`, `assay_results` table), work orders out
(`lab-dispatch.ts`), consented CC0 data back out (`assay-export`).
CRO photos segment through SAM 3.1 (`lib/sam-client.ts`,
`@meta-sam/parser`, `cro_image_analyses` table) with a content-hash
cache.

## Learning loop (future)

`ml/` holds the training skeleton: CC0 exports → Muse distillation /
SFT pairs → LoRA adapters → eval-gated Hub publish. Inert until real
assay volume arrives; see `ml/README.md`.

## Cross-cutting

- Safety: server-side blocklist, refusal parity between demo and API,
  biosafety footer, RUO gating. Nothing ships without human review.
- Config: Bearer [REDACTED] API + model keys; Docker image and CI
  (`npm run score` self-checks the 4-pillar rubric).
