"""Score model predictions against the coding evaluation golden set.

The same golden set is used by the live agent (training/eval/run_evals.mjs)
and by a fine-tuned model, so both can be compared on the same terms.

Usage:
    python score.py --goldens coding_tests.jsonl --predictions predictions.jsonl

Predictions are JSONL with one object per line:
    {"id": "js-null-safety", "action": {"action": "edit", "filename": "app.js", "content": "..."}}
    {"id": "js-null-safety", "output": "{\"action\": \"edit\", ...}"}

Exit code is 1 when the pass rate is below --threshold.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


def read_jsonl(path):
    records = []
    with open(path, encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, start=1):
            if not raw.strip():
                continue
            try:
                records.append(json.loads(raw))
            except json.JSONDecodeError as exc:
                print(f"{path}:{line_number}: invalid JSON: {exc}")
    return records


def extract_action(record):
    """Return the action object from a prediction, whatever shape it arrived in."""
    action = record.get("action")
    if isinstance(action, dict):
        return action

    output = record.get("output")
    if isinstance(output, str):
        text = output.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.lower().startswith("json"):
                text = text[4:]
        try:
            value = json.loads(text)
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end > start:
                try:
                    value = json.loads(text[start:end + 1])
                    if isinstance(value, dict):
                        return value
                except json.JSONDecodeError:
                    pass
    return None


def score_case(case, action):
    failures = []
    expect = case.get("expect") or {}

    if not action:
        return ["no action returned"]

    if expect.get("action") and action.get("action") != expect["action"]:
        failures.append(f"expected action {expect['action']!r} but got {action.get('action')!r}")

    expected_file = expect.get("filename")
    if expected_file and action.get("filename") != expected_file and action.get("path") != expected_file:
        failures.append(f"expected filename {expected_file!r} but got {action.get('filename') or action.get('path')!r}")

    content = action.get("content")
    if not isinstance(content, str):
        content = action.get("message") if isinstance(action.get("message"), str) else ""

    for needle in expect.get("contentContains") or []:
        if needle not in content:
            failures.append(f"content is missing {needle!r}")

    for needle in case.get("forbid") or []:
        if needle in content:
            failures.append(f"content contains forbidden {needle!r}")

    return failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--goldens", default="coding_tests.jsonl")
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--threshold", type=float, default=0.7)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    goldens = read_jsonl(args.goldens)
    predictions = {record.get("id"): record for record in read_jsonl(args.predictions)}

    results = []
    by_language = defaultdict(lambda: {"pass": 0, "total": 0})

    for case in goldens:
        case_id = case.get("id")
        language = case.get("language", "unknown")
        action = extract_action(predictions.get(case_id, {}))
        failures = score_case(case, action)

        results.append({
            "id": case_id,
            "language": language,
            "pass": not failures,
            "failures": failures,
        })
        by_language[language]["total"] += 1
        if not failures:
            by_language[language]["pass"] += 1

    passed = sum(1 for result in results if result["pass"])
    rate = passed / len(results) if results else 0.0

    for result in results:
        status = "PASS" if result["pass"] else "FAIL"
        print(f"{status}  {result['id']} ({result['language']})")
        for failure in result["failures"]:
            print(f"      - {failure}")

    print(f"\nOverall: {passed}/{len(results)} ({rate * 100:.1f}%)")
    for language, entry in sorted(by_language.items()):
        print(f"  {language:<12} {entry['pass']}/{entry['total']}")

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as handle:
            for result in results:
                handle.write(json.dumps(result, ensure_ascii=False) + "\n")
        print(f"\nResults written to {args.out}")

    if rate < args.threshold:
        print(f"\nPass rate {rate * 100:.1f}% is below the {args.threshold * 100:.0f}% threshold.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
