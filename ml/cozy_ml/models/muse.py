"""Load Muse-series open-weight base models and LoRA adapters.

The exact Hugging Face Hub ID for the Muse open-weight release must be
confirmed before first training (see ml/README.md activation checklist
and configs/sft_muse.yaml). This module takes the ID as an argument and
refuses the documented placeholder so a misconfigured run fails loudly.
"""

from __future__ import annotations

PLACEHOLDER_BASE_MODEL = "REPLACE-ME/muse-8b"


def resolve_base_model(configured: str | None) -> str:
    if not configured or configured == PLACEHOLDER_BASE_MODEL:
        raise ValueError(
            "Set configs/sft_muse.yaml: base_model to the confirmed Muse "
            "open-weight Hub ID (activation checklist step 1)."
        )
    return configured


def load_base_model(base_model: str, load_in_4bit: bool = True):
    """Load tokenizer + causal-LM base. Requires torch/transformers."""
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    kwargs: dict = {"device_map": "auto"}
    if load_in_4bit:
        from transformers import BitsAndBytesConfig

        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype="bfloat16",
            bnb_4bit_quant_type="nf4",
        )
    model = AutoModelForCausalLM.from_pretrained(base_model, **kwargs)
    return tokenizer, model


def apply_lora(
    model,
    r: int = 16,
    alpha: int = 32,
    dropout: float = 0.05,
    targets: tuple[str, ...] = ("q_proj", "v_proj"),
):
    """Wrap the base model with a trainable LoRA adapter."""
    from peft import LoraConfig, get_peft_model

    config = LoraConfig(
        r=r,
        lora_alpha=alpha,
        lora_dropout=dropout,
        target_modules=list(targets),
        task_type="CAUSAL_LM",
    )
    return get_peft_model(model, config)


def load_adapter(base_model: str, adapter_path: str):
    """Load base + a previously trained adapter for eval/generation."""
    from peft import PeftModel

    tokenizer, model = load_base_model(base_model, load_in_4bit=True)
    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()
    return tokenizer, model
