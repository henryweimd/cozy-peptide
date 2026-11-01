# cozy-ml — Muse distillation & fine-tuning on lab-loop data

> **Status: skeleton. No training data yet, nothing trained.**
> This subproject is intentionally inert until real assay data exists.
> It is fully separate from the Next.js web app: no shared code, no shared
> dependencies, coupled only by the assay-export API contract below.

## For agents (activation checklist)

If you are an agent asked to activate training, do these in order:

1. **Confirm the Muse open-weight Hub ID.** `configs/sft_muse.yaml`
   holds a `REPLACE-ME` placeholder; training refuses to run until it is
   replaced with the real Meta Muse-series release ID. Do not guess it.
2. **Check data volume.** `export.py` joins assay rows to run sequences.
   Fewer than ~50 validated (`passed`) rows: stop, report the count, do
   not train. Rerankers need signal; SFT on a handful of pairs is theater.
3. **Export + build pairs** (commands below), record the export hash.
4. **Train on a GPU host** — never in CI, never on a laptop CPU.
   8B QLoRA fits one 24GB card; 70B needs 2×80GB or an API-backed
   alternative. Mac MPS can run eval smoke tests, not training.
5. **Eval must pass.** `evaluate.py` writes `eval-report.json`; validity
   must clear 0.8 AND the run notes must compare against the symbolic
   baseline (charge/cysteine heuristics). Losing to heuristics = do not ship.
6. **Publish the adapter** with `hub/publish.py` (refuses without a
   passing eval report), then link the Hub repo from the root README.
   The repo scorer (`npm run score`) flips its fine-tuning signals
   automatically once `ml/artifacts/<run>/` holds an adapter config +
   eval report and the Hub link exists.

## What this trains

A **student**: a Muse-series open-weight causal LM, LoRA-adapted to map
(disease target + scaffold + constraints) → validated peptide sequence.

The **teacher** is the existing pipeline: Muse Spark ideation plus the
symbolic compiler, whose outputs the bench validated. Training pairs are
sequence-level distillation — teacher outputs on validated examples —
built by `cozy_ml/data/datasets.py`. Logit-level KD is a future upgrade
for when teacher weights are available locally; the data format already
carries teacher provenance (`meta.teacher`, `meta.run_id`) for that.

## Contract with the web app

- `GET {base}/api/assay-export?format=json&limit=N` (Bearer token) →
  `{success, data: {count, max_limit, rows}}`, `template_version: labguide-1`.
- `GET {base}/api/peptide-run?id=<uuid>` (public) →
  `{success, data: {target, modality, chargeTarget, candidateId,
  candidateSequence, ...}}`.
- **Consent is fail-closed**: only rows with `consent_license == "CC0"`
  enter training data. Any other value is dropped silently and counted.
- If either endpoint changes shape, update `cozy_ml/data/export.py` and
  these docs together.

## Layout

- `cozy_ml/data/export.py` — fetch assays, resolve run sequences, join.
- `cozy_ml/data/datasets.py` — SFT/distillation pairs, dedup, split.
- `cozy_ml/models/muse.py` — base + LoRA adapter loading.
- `cozy_ml/train/train_sft.py` — LoRA-SFT loop (GPU host).
- `cozy_ml/train/generate.py` — completions for eval (GPU host).
- `cozy_ml/eval/evaluate.py` — stdlib-only scoring → `eval-report.json`.
- `cozy_ml/hub/publish.py` — Hub upload with generated model card.
- `configs/sft_muse.yaml` — hyperparameters + model ID.
- `data/synthetic/` — committed fixtures for smoke tests.
- `tests/` — stdlib `unittest`, no torch needed.

## Quickstart

```bash
cd ml
uv venv && uv sync              # project-local .venv (creates uv.lock)
uv run python -m unittest discover -s tests   # smoke tests, no GPU

# With credentials + data (activation checklist first):
uv run python -m cozy_ml.data.export --help
```

CPU-only smoke tests also run on the system interpreter without
installing anything: `cd ml && python3 -m unittest discover -s tests`.

## Hardware notes

| Setup | VRAM | Notes |
|---|---|---|
| 8B QLoRA SFT | ~24GB | 1× RTX 4090 / A10 / L4 spot |
| 8B full-precision LoRA | ~40GB | 1× A100 40GB |
| 70B QLoRA SFT | 2×80GB | 2× A100/H100, or defer |
| Eval + data prep | CPU | runs anywhere |

Spot preemptible GPUs (or Colab A100 for small runs) are the expected
home for training. Nothing here assumes a persistent cluster.
