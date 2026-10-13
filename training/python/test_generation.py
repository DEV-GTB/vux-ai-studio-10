"""Quick smoke test for a saved adapter.

Usage:
    BASE_MODEL=... ADAPTER_DIR=... python test_generation.py
"""
import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_MODEL = os.getenv("BASE_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
ADAPTER_DIR = os.getenv("ADAPTER_DIR", "outputs/coding/adapter")

tokenizer = AutoTokenizer.from_pretrained(ADAPTER_DIR, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL, torch_dtype="auto", device_map="auto" if torch.cuda.is_available() else None,
    trust_remote_code=True,
)
model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
model.eval()

messages = [{"role": "user", "content": "Write a Python function that checks whether a number is prime. Include edge cases."}]
prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
with torch.no_grad():
    out = model.generate(**inputs, max_new_tokens=256, do_sample=False,
                        pad_token_id=tokenizer.eos_token_id)
print(tokenizer.decode(out[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True))
