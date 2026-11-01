"""Score generated completions without any ML dependency (stdlib only).

Metrics over completions JSONL (see train/generate.py):
  validity_rate   fraction with an extractable peptide-like sequence
                  (length bounds, canonical alphabet, charge in range,
                  knottin cysteine count when the prompt names knottin)
  novelty_rate    fraction of valid sequences absent from training data
  diversity       mean pairwise dissimilarity over a sampled subset
  reference_sim   mean best fractional identity to validated references

Writes eval-report.json. Ship-gate: validity must clear MIN_VALIDITY
and the run must document a comparison against the symbolic baseline
(see ml/README.md); publish.py refuses to upload without this report.
"""

from __future__ import annotations

import argparse
import json
import random
import re

AA = set("ACDEFGHIKLMNPQRSTVWY")
SEQ_RE = re.compile(r"[ACDEFGHIKLMNPQRSTVWY]{8,80}")

MIN_VALIDITY = 0.8


def parse_sequence(completion: str) -> str | None:
    """First peptide-like run in the completion, else None."""
    match = SEQ_RE.search((completion or "").upper())
    return match.group(0) if match else None


def net_charge(sequence: str) -> int:
    return (
        sequence.count("K")
        + sequence.count("R")
        - sequence.count("D")
        - sequence.count("E")
    )


def validity_issues(
    sequence: str,
    prompt_text: str,
    min_len: int = 20,
    max_len: int = 37,
    charge_min: int = 0,
    charge_max: int = 9,
) -> list[str]:
    issues = []
    if not (min_len <= len(sequence) <= max_len):
        issues.append(f"length {len(sequence)} outside {min_len}-{max_len}")
    if any(res not in AA for res in sequence):
        issues.append("non-canonical residues")
    charge = net_charge(sequence)
    if not (charge_min <= charge <= charge_max):
        issues.append(f"charge {charge} outside {charge_min}-{charge_max}")
    if "knottin" in prompt_text.lower() and sequence.count("C") != 6:
        issues.append(f"cysteine count {sequence.count('C')} != 6")
    return issues


def fractional_identity(a: str, b: str) -> float:
    """Identity over the shorter sequence (ungapped, order-sensitive)."""
    width = min(len(a), len(b))
    if width == 0:
        return 0.0
    return sum(1 for x, y in zip(a[:width], b[:width]) if x == y) / width


def evaluate(
    completions: list[dict],
    train_sequences: set[str],
    references: list[str],
    seed: int = 7,
) -> dict:
    prompt_texts = [
        " ".join(
            m.get("content", "")
            for m in item.get("messages", [])
            if m.get("role") == "user"
        )
        for item in completions
    ]
    parsed = [parse_sequence(item.get("completion", "")) for item in completions]
    valid = [
        seq
        for seq, prompt in zip(parsed, prompt_texts)
        if seq is not None and not validity_issues(seq, prompt)
    ]
    novelty = [s for s in valid if s not in train_sequences]

    rng = random.Random(seed)
    sample = rng.sample(valid, min(len(valid), 200))
    pairs = [
        1.0 - fractional_identity(a, b)
        for i, a in enumerate(sample)
        for b in sample[i + 1 :]
    ]
    ref_sims = [
        max([fractional_identity(s, r) for r in references] or [0.0])
        for s in valid
    ]
    total = len(completions)
    return {
        "n": total,
        "n_valid": len(valid),
        "validity_rate": (len(valid) / total) if total else 0.0,
        "novelty_rate": (len(novelty) / len(valid)) if valid else 0.0,
        "diversity": (sum(pairs) / len(pairs)) if pairs else 0.0,
        "reference_sim_mean": (sum(ref_sims) / len(ref_sims)) if ref_sims else 0.0,
        "min_validity_gate": MIN_VALIDITY,
        "passes_gate": (len(valid) / total) >= MIN_VALIDITY if total else False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Score completions JSONL")
    parser.add_argument("--completions", required=True)
    parser.add_argument("--train", required=True, help="train pairs JSONL")
    parser.add_argument("--references", required=True, help="one sequence per line")
    parser.add_argument("--out", required=True, help="eval-report.json path")
    cli = parser.parse_args()

    completions = [
        json.loads(line)
        for line in open(cli.completions, encoding="utf-8")
        if line.strip()
    ]
    train_sequences = set()
    for line in open(cli.train, encoding="utf-8"):
        if not line.strip():
            continue
        for message in json.loads(line).get("messages", []):
            if message.get("role") == "assistant":
                parsed = parse_sequence(message.get("content", ""))
                if parsed:
                    train_sequences.add(parsed)
    references = [
        line.strip().upper()
        for line in open(cli.references, encoding="utf-8")
        if line.strip()
    ]
    report = evaluate(completions, train_sequences, references)
    with open(cli.out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
