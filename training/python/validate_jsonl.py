"""Validate conversational JSONL datasets used for fine-tuning.

Usage:
    python validate_jsonl.py data/train/coding.jsonl ...
"""
import json
import sys
from pathlib import Path

REQUIRED_MESSAGE_KEYS = {"role", "content"}
ALLOWED_ROLES = {"user", "assistant", "system"}


def validate_file(path: Path):
    errors = 0
    count = 0
    with path.open("r", encoding="utf-8") as file:
        for line_number, raw in enumerate(file, start=1):
            if not raw.strip():
                continue
            count += 1
            try:
                record = json.loads(raw)
            except json.JSONDecodeError as exc:
                print(f"{path}:{line_number}: invalid JSON: {exc}")
                errors += 1
                continue

            messages = record.get("messages")
            if not isinstance(messages, list) or not messages:
                print(f"{path}:{line_number}: missing or empty messages array")
                errors += 1
                continue

            bad = False
            for index, message in enumerate(messages):
                if not isinstance(message, dict):
                    print(f"{path}:{line_number}: message {index} is not an object")
                    bad = True
                    break
                if not REQUIRED_MESSAGE_KEYS.issubset(message):
                    print(f"{path}:{line_number}: message {index} missing role/content")
                    bad = True
                    break
                if message["role"] not in ALLOWED_ROLES:
                    print(f"{path}:{line_number}: message {index} has invalid role {message['role']!r}")
                    bad = True
                    break
                if not isinstance(message["content"], str) or not message["content"].strip():
                    print(f"{path}:{line_number}: message {index} has empty/non-string content")
                    bad = True
                    break
            if bad:
                errors += 1
                continue

            if messages[-1]["role"] != "assistant":
                print(f"{path}:{line_number}: last message should be assistant")
                errors += 1
                continue

    status = "OK" if errors == 0 else "FAILED"
    print(f"{path}: {count} records, {errors} errors -> {status}")
    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_jsonl.py <file> [...]")
        sys.exit(2)
    total_errors = 0
    for argument in sys.argv[1:]:
        total_errors += validate_file(Path(argument))
    sys.exit(1 if total_errors else 0)


if __name__ == "__main__":
    main()
