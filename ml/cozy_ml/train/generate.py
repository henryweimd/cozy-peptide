"""Generate candidate completions from a base or adapter model.

Reads eval prompts JSONL ({messages:[...]}, assistant turn stripped at
load) and writes completions JSONL for cozy_ml.eval.evaluate.
GPU host only.
"""

from __future__ import annotations

import argparse
import json

from cozy_ml.models.muse import load_adapter, load_base_model


def load_prompts(path: str) -> list[dict]:
    prompts = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                prompts.append(json.loads(line))
    return prompts


def main() -> None:
    import torch

    parser = argparse.ArgumentParser(description="Generate eval completions")
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--adapter", default=None)
    parser.add_argument("--prompts", required=True, help="eval pairs JSONL")
    parser.add_argument("--out", required=True, help="completions JSONL")
    parser.add_argument("--max-new-tokens", type=int, default=128)
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--top-p", type=float, default=0.9)
    cli = parser.parse_args()

    if cli.adapter:
        tokenizer, model = load_adapter(cli.base_model, cli.adapter)
    else:
        tokenizer, model = load_base_model(cli.base_model, load_in_4bit=True)
        model.eval()

    pairs = load_prompts(cli.prompts)
    with open(cli.out, "w", encoding="utf-8") as out:
        for pair in pairs:
            messages = [
                m for m in pair["messages"] if m["role"] != "assistant"
            ]
            inputs = tokenizer.apply_chat_template(
                messages, return_tensors="pt", add_generation_prompt=True
            ).to(model.device)
            with torch.no_grad():
                generated = model.generate(
                    inputs,
                    max_new_tokens=cli.max_new_tokens,
                    temperature=cli.temperature,
                    top_p=cli.top_p,
                    do_sample=cli.temperature > 0,
                    pad_token_id=tokenizer.pad_token_id,
                )
            completion = tokenizer.decode(
                generated[0][inputs.shape[1]:], skip_special_tokens=True
            )
            out.write(
                json.dumps(
                    {
                        "messages": pair["messages"],
                        "completion": completion.strip(),
                        "meta": pair.get("meta", {}),
                    }
                )
                + "\n"
            )
    print(f"wrote {len(pairs)} completions to {cli.out}")


if __name__ == "__main__":
    main()
