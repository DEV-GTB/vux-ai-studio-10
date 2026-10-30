"""Build a local FAISS index from approved knowledge chunks (JSONL).

Input: data/processed/knowledge_chunks.jsonl  (fields: chunk_id, document_id, text, source_url, ...)
Output: retrieval/index/knowledge.faiss + documents.pkl
"""
import json
import pickle
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

DATA_FILE = Path("data/processed/knowledge_chunks.jsonl")
OUTPUT_DIR = Path("retrieval/index")
# BGE-M3 is the embedding model the rest of the stack uses. It replaces the
# older multilingual-e5-small.
EMBEDDING_MODEL = "BAAI/bge-m3"
# The "passage:" and "query:" prefixes belong to the E5 models. BGE-M3 takes
# the text as it is, so the prefix has to go when the model changes.
PREFIX = "" if "bge" in EMBEDDING_MODEL.lower() else "passage: "


def load_documents():
    documents = []
    if not DATA_FILE.exists():
        return documents
    with DATA_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            item = json.loads(line)
            if not item.get("text") or not item.get("source_url"):
                continue
            documents.append(item)
    return documents


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    documents = load_documents()
    if not documents:
        print("No documents to index.")
        return
    encoder = SentenceTransformer(EMBEDDING_MODEL)
    texts = [PREFIX + d["text"] for d in documents]
    vectors = encoder.encode(texts, normalize_embeddings=True, convert_to_numpy=True).astype("float32")
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(vectors)
    faiss.write_index(index, str(OUTPUT_DIR / "knowledge.faiss"))
    with (OUTPUT_DIR / "documents.pkl").open("wb") as f:
        pickle.dump(documents, f)
    print(f"Indexed {len(documents)} documents.")


if __name__ == "__main__":
    main()
