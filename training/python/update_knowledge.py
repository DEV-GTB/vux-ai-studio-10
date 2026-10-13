"""Safe skeleton for a daily knowledge-update job.

It logs approved sources and hashes; it does NOT download or index anything
until you implement source-specific collectors. Extend collect() per source.
"""
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("knowledge")
MANIFEST = ROOT / "sources.jsonl"
LOG = ROOT / "update_log.jsonl"


def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_manifest():
    if not MANIFEST.exists():
        return []
    records = []
    with MANIFEST.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def write_log(event):
    ROOT.mkdir(parents=True, exist_ok=True)
    event["logged_at"] = datetime.now(timezone.utc).isoformat()
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def collect():
    """Return list of (source_id, text) for changed sources. Implement per source."""
    return []


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    changed = 0
    for source_id, text in collect():
        new_hash = sha256_text(text)
        write_log({"event": "collected", "source": source_id, "hash": new_hash})
        changed += 1
    write_log({"event": "run_complete", "changed": changed})
    print(f"Knowledge update run complete. Changed sources: {changed}")


if __name__ == "__main__":
    main()
