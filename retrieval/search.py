"""Search the local knowledge index."""
import pickle
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

INDEX_DIR = Path("retrieval/index")
# BGE-M3 is the embedding model the rest of the stack uses. It replaces the
# older multilingual-e5-small.
EMBEDDING_MODEL = "BAAI/bge-m3"
# The "passage:" and "query:" prefixes belong to the E5 models. BGE-M3 takes
# the text as it is, so the prefix has to go when the model changes. The
# index and the search have to use the same one.
PREFIX = "" if "bge" in EMBEDDING_MODEL.lower() else "query: "


def load_index():
    index = faiss.read_index(str(INDEX_DIR / "knowledge.faiss"))
    with (INDEX_DIR / "documents.pkl").open("rb") as f:
        documents = pickle.load(f)
    return index, documents


def search(query, limit=5):
    encoder = SentenceTransformer(EMBEDDING_MODEL)
    index, documents = load_index()
    qv = encoder.encode([PREFIX + query], normalize_embeddings=True, convert_to_numpy=True).astype("float32")
    scores, indices = index.search(qv, min(limit, len(documents)))
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0:
            continue
        doc = documents[idx]
        results.append({"score": float(score), "chunk_id": doc.get("chunk_id"), "text": doc.get("text"), "source_url": doc.get("source_url")})
    return results


if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) or "Kerala"
    for r in search(q):
        print(f"{r['score']:.3f} {r['source_url']} :: {r['text'][:120]}")
