"""Basic, fast supervised fine-tuning with LoRA (QLoRA optional).

Run:
    python train_coding.py

Environment overrides:
    BASE_MODEL          HF model id (default: small CPU-friendly coder)
    TRAIN_FILE / VALID_FILE / OUTPUT_DIR / MAX_LENGTH / EPOCHS / LR / BATCH_SIZE
    GRAD_ACCUM / LORA_R / USE_4BIT (1 to enable 4-bit on CUDA)
"""
import os
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTConfig, SFTTrainer

MODEL_ID = os.getenv("BASE_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
TRAIN_FILE = os.getenv("TRAIN_FILE", "data/train/coding.jsonl")
VALID_FILE = os.getenv("VALID_FILE", "data/validation/coding.jsonl")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs/coding/adapter")
MAX_LENGTH = int(os.getenv("MAX_LENGTH", "512"))
EPOCHS = float(os.getenv("EPOCHS", "1"))
LEARNING_RATE = float(os.getenv("LR", "1e-4"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "1"))
GRAD_ACCUM = int(os.getenv("GRAD_ACCUM", "8"))
LORA_R = int(os.getenv("LORA_R", "8"))
USE_4BIT = os.getenv("USE_4BIT", "0") == "1"

os.makedirs(OUTPUT_DIR, exist_ok=True)

cuda = torch.cuda.is_available()
print(f"[train] python={torch.__version__} cuda={cuda} model={MODEL_ID}")
if not cuda:
    print("[train] No CUDA detected -> CPU training. Use a small model and few examples, or run in Colab/Kaggle for GPU.")

dtype = torch.float16 if cuda else torch.float32


def load_tokenizer():
    tok = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    return tok


def load_model(tokenizer):
    quant_config = None
    if USE_4BIT and cuda:
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=dtype,
        )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        device_map="auto" if cuda else None,
        quantization_config=quant_config,
        trust_remote_code=True,
    )
    if quant_config is not None:
        model = prepare_model_for_kbit_training(model)
    lora = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_R * 2,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()
    return model


def prepare_dataset(tokenizer, path):
    raw = load_dataset("json", data_files=path, split="train")
    def to_text(row):
        text = tokenizer.apply_chat_template(
            row["messages"], tokenize=False, add_generation_prompt=False
        )
        return {"text": text}
    return raw.map(to_text, remove_columns=raw.column_names)


def main():
    tokenizer = load_tokenizer()
    model = load_model(tokenizer)

    train_ds = prepare_dataset(tokenizer, TRAIN_FILE)
    print(f"[train] train examples: {len(train_ds)}")

    eval_ds = None
    if os.path.exists(VALID_FILE):
        eval_ds = prepare_dataset(tokenizer, VALID_FILE)
        print(f"[train] eval examples: {len(eval_ds)}")

    args = SFTConfig(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=LEARNING_RATE,
        logging_steps=5,
        save_strategy="epoch",
        eval_strategy="epoch" if eval_ds is not None else "no",
        fp16=cuda,
        bf16=False,
        max_seq_length=MAX_LENGTH,
        packing=False,
        report_to="none",
        save_total_limit=2,
    )

    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,
        dataset_text_field="text",
    )

    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"[train] saved adapter -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
