"""Simple evaluation: run a fixed prompt set through base and fine-tuned models.

Usage:
    python evaluate.py --base Qwen/Qwen2.5-0.5B-Instruct --adapter outputs/coding/adapter --prompts evaluation/coding_tests.jsonl
"""
import argparse
import json
import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel


def load_model(base, adapter=None):
    tokenizer = AutoTokenizer.from_pretrained(adapter or base, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        base, torch_dtype="auto", device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    if adapter:
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()
    return tokenizer, model


def generate(tokenizer, model, prompt, max_new_tokens=256):
    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False,
                            pad_token_id=tokenizer.eos_token_id)
    return tokenizer.decode(out[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", required=True)
    p.add_argument("--adapter", default=None)
    p.add_argument("--prompts", required=True)
    p.add_argument("--out", default="evaluation/results.jsonl")
    args = p.parse_args()

    tokenizer, model = load_model(args.base, args.adapter)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.prompts, encoding="utf-8") as f, open(args.out, "a", encoding="utf-8") as out:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            prompt = rec.get("prompt") or rec.get("input") or rec.get("question")
            expected = rec.get("expected")
            got = generate(tokenizer, model, prompt)
            result = {"model": args.adapter or args.base, "prompt": prompt,
                      "expected": expected, "output": got}
            out.write(json.dumps(result, ensure_ascii=False) + "\n")
            print("---")
            print("PROMPT:", prompt)
            print("OUTPUT:", got[:500])


if __name__ == "__main__":
    main()
