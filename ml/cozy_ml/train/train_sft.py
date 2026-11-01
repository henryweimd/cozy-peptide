"""LoRA supervised fine-tune of a Muse base model on lab-loop pairs.

Reads configs/sft_muse.yaml + train/eval JSONL (messages format), trains
with TRL's SFTTrainer, and writes the adapter plus run-metadata.json
(config hash, data hash, base model, eval metrics) for provenance.

Runs on a GPU host only; never in CI. CPU smoke coverage lives in
ml/tests (dataset/config/eval), which need no torch install.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone

import yaml

from cozy_ml.models.muse import apply_lora, load_base_model, resolve_base_model


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    if not isinstance(config, dict):
        raise ValueError(f"{path} is not a mapping")
    return config


def main() -> None:
    parser = argparse.ArgumentParser(description="LoRA-SFT a Muse model")
    parser.add_argument("--config", required=True)
    parser.add_argument("--train", required=True, help="train pairs JSONL")
    parser.add_argument("--eval", required=True, help="eval pairs JSONL")
    parser.add_argument("--out", required=True, help="adapter output dir")
    cli = parser.parse_args()

    # Late imports: training-only deps must never load at module import.
    from datasets import load_dataset
    from trl import SFTConfig, SFTTrainer

    config = load_config(cli.config)
    base_model = resolve_base_model(config.get("base_model"))
    lora = config.get("lora", {})
    training = config.get("training", {})

    tokenizer, model = load_base_model(
        base_model, load_in_4bit=bool(config.get("load_in_4bit", True))
    )
    model = apply_lora(
        model,
        r=int(lora.get("r", 16)),
        alpha=int(lora.get("alpha", 32)),
        dropout=float(lora.get("dropout", 0.05)),
        targets=tuple(lora.get("targets", ["q_proj", "v_proj"])),
    )

    dataset = load_dataset(
        "json", data_files={"train": cli.train, "eval": cli.eval}
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset["train"],
        eval_dataset=dataset["eval"],
        processing_class=tokenizer,
        args=SFTConfig(
            output_dir=cli.out,
            num_train_epochs=float(training.get("epochs", 3)),
            learning_rate=float(training.get("learning_rate", 2e-4)),
            per_device_train_batch_size=int(training.get("batch_size", 2)),
            gradient_accumulation_steps=int(
                training.get("grad_accum", 8)
            ),
            eval_strategy="epoch",
            save_strategy="epoch",
            load_best_model_at_end=True,
            logging_steps=int(training.get("logging_steps", 10)),
            bf16=True,
        ),
    )
    trainer.train()
    metrics = trainer.evaluate()

    os.makedirs(cli.out, exist_ok=True)
    trainer.save_model(cli.out)
    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "base_model": base_model,
        "config_sha256": sha256_file(cli.config),
        "train_sha256": sha256_file(cli.train),
        "eval_sha256": sha256_file(cli.eval),
        "eval_metrics": metrics,
    }
    with open(os.path.join(cli.out, "run-metadata.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
    print(json.dumps({"adapter_dir": cli.out, "eval_metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()
