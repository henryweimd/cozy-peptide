"""Build SFT / distillation pairs from joined lab-loop records.

Each pair teaches the student (a Muse-series open-weight model) the mapping
the teacher pipeline (Muse Spark + symbolic compiler) demonstrated on
designs the bench later validated:

  messages: system + user(target, scaffold, charge, assay context)
            + assistant(validated sequence)

That is sequence-level distillation: the student learns from teacher
outputs on validated examples. Logit-level KD is a documented upgrade
(see ml/README.md) for when teacher weights are available locally.
"""

from __future__ import annotations

import json
import random

SYSTEM_PROMPT = (
    "You design novel small therapeutic peptides for Live Biotherapeutic "
    "Products. Given a disease target and design constraints, output exactly "
    "one candidate: a single line with the mature amino-acid sequence in "
    "one-letter code, nothing else."
)


def build_user_prompt(record) -> str:
    """Render the instruction side from a JoinedRecord (duck-typed)."""
    lines = [f"Disease target: {record.target}"]
    if record.modality:
        lines.append(f"Scaffold: {record.modality}")
    if record.charge_target is not None:
        lines.append(f"Net charge target: {record.charge_target}")
    context = []
    if record.assay_type:
        context.append(f"validated by {record.assay_type}")
    if record.organism_or_cells:
        context.append(f"in {record.organism_or_cells}")
    if record.value_num is not None:
        unit = f" {record.value_unit}" if record.value_unit else ""
        context.append(f"measurement {record.value_num}{unit}")
    if context:
        lines.append("Bench context: " + "; ".join(context) + ".")
    lines.append("Design the mature peptide sequence.")
    return "\n".join(lines)


def build_pairs(
    records,
    teacher: str = "muse-spark-pipeline",
    passed_only: bool = True,
) -> list[dict]:
    """Build deduplicated SFT/distillation pairs from joined records."""
    pairs: list[dict] = []
    seen_sequences: set[str] = set()
    for record in records:
        if passed_only and record.passed is not True:
            continue
        sequence = record.sequence.strip().upper()
        if not sequence or sequence in seen_sequences:
            continue
        seen_sequences.add(sequence)
        pairs.append(
            {
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": build_user_prompt(record)},
                    {"role": "assistant", "content": sequence},
                ],
                "meta": {
                    "teacher": teacher,
                    "assay_id": record.assay_id,
                    "run_id": record.run_id,
                    "assay_type": record.assay_type,
                    "template_version": record.template_version,
                    "consent_license": record.consent_license,
                },
            }
        )
    return pairs


def train_eval_split(
    pairs: list[dict], eval_fraction: float = 0.2, seed: int = 7
) -> tuple[list[dict], list[dict]]:
    """Deterministic split; eval gets at least 1 pair when possible."""
    rng = random.Random(seed)
    order = list(range(len(pairs)))
    rng.shuffle(order)
    n_eval = min(len(pairs), max(1 if pairs else 0, round(len(pairs) * eval_fraction)))
    eval_idx = set(order[:n_eval])
    train = [p for i, p in enumerate(pairs) if i not in eval_idx]
    eval_pairs = [p for i, p in enumerate(pairs) if i in eval_idx]
    return train, eval_pairs


def write_jsonl(path: str, pairs: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        for pair in pairs:
            handle.write(json.dumps(pair) + "\n")
