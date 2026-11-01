"""Publish a trained adapter + eval report to Hugging Face Hub.

Fail-closed: refuses to upload unless eval-report.json exists beside the
adapter and passes its validity gate. The generated model card records
the base model, data provenance hash, eval metrics, and the license
split (weights follow the base-model license; training rows are CC0).
"""

from __future__ import annotations

import argparse
import json
import os

CARD_TEMPLATE = """---
base_model: {base_model}
tags: [peptide-design, lora, cozy-peptide]
---

# {repo_id}

LoRA adapter fine-tuned on cozy-peptide lab-loop assay data: validated
therapeutic peptide designs and their bench measurements.

- Base model: `{base_model}` (weights remain under the base-model license)
- Training rows: CC0 community assay exports only
- Data hash: `{data_hash}`
- Eval: validity {validity:.2f} (gate ≥ {gate:.2f}), novelty {novelty:.2f},
  diversity {diversity:.2f} — full metrics in `eval-report.json`
- Intended use: research-only peptide ideation with human oversight and
  symbolic safety review. Not medical advice.
"""


def load_report(adapter_dir: str) -> dict:
    path = os.path.join(adapter_dir, "eval-report.json")
    if not os.path.exists(path):
        raise ValueError(f"missing {path}: run eval first")
    with open(path, encoding="utf-8") as handle:
        report = json.load(handle)
    if not report.get("passes_gate"):
        raise ValueError(f"{path} fails its validity gate: {report}")
    return report


def write_model_card(
    adapter_dir: str, repo_id: str, base_model: str, data_hash: str, report: dict
) -> str:
    card = CARD_TEMPLATE.format(
        repo_id=repo_id,
        base_model=base_model,
        data_hash=data_hash,
        validity=report["validity_rate"],
        gate=report["min_validity_gate"],
        novelty=report["novelty_rate"],
        diversity=report["diversity"],
    )
    path = os.path.join(adapter_dir, "README.md")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(card)
    return path


def main() -> None:
    from huggingface_hub import HfApi

    parser = argparse.ArgumentParser(description="Publish adapter to Hub")
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--data-hash", required=True)
    cli = parser.parse_args()

    report = load_report(cli.adapter)
    write_model_card(
        cli.adapter, cli.repo_id, cli.base_model, cli.data_hash, report
    )
    HfApi().upload_folder(
        folder_path=cli.adapter,
        repo_id=cli.repo_id,
        repo_type="model",
    )
    print(f"published {cli.adapter} to https://huggingface.co/{cli.repo_id}")


if __name__ == "__main__":
    main()
