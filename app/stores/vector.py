"""ChromaDB wrapper — per-client collection, persistent storage."""
from __future__ import annotations
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL = "BAAI/bge-m3"
_EMBEDDING_FALLBACK = "intfloat/multilingual-e5-base"


def _get_embedding_fn():
    """Lazy-load embedding function, fall back if model too heavy."""
    try:
        from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        ef = SentenceTransformerEmbeddingFunction(model_name=_EMBEDDING_MODEL)
        logger.info(f"Embedding model: {_EMBEDDING_MODEL}")
        return ef
    except Exception as e:
        logger.warning(f"bge-m3 failed ({e}), falling back to {_EMBEDDING_FALLBACK}")
        from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        return SentenceTransformerEmbeddingFunction(model_name=_EMBEDDING_FALLBACK)


class VectorStore:
    def __init__(self, chroma_path: Path):
        import chromadb
        chroma_path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(chroma_path))
        self._ef = _get_embedding_fn()
        self._collections: dict[str, object] = {}

    def _collection(self, name: str):
        if name not in self._collections:
            self._collections[name] = self._client.get_or_create_collection(
                name=name,
                embedding_function=self._ef,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collections[name]

    def add_documents(self, collection_name: str, docs: list[dict]) -> None:
        """
        docs: list of {id, text, metadata}.
        Upserts to avoid duplicate-key errors on re-ingest.
        """
        col = self._collection(collection_name)
        ids = [d["id"] for d in docs]
        texts = [d["text"] for d in docs]
        metadatas = [d.get("metadata", {}) for d in docs]
        # Batch to avoid memory spikes
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            col.upsert(
                ids=ids[i : i + batch_size],
                documents=texts[i : i + batch_size],
                metadatas=metadatas[i : i + batch_size],
            )

    def query(
        self,
        collection_name: str,
        query_text: str,
        n_results: int = 10,
    ) -> list[dict]:
        """Return top-n results as list of {text, metadata, distance}."""
        col = self._collection(collection_name)
        try:
            count = col.count()
        except Exception:
            count = 0
        if count == 0:
            return []

        n_results = min(n_results, count)
        result = col.query(
            query_texts=[query_text],
            n_results=n_results,
        )

        out: list[dict] = []
        for doc, meta, dist in zip(
            result["documents"][0],
            result["metadatas"][0],
            result["distances"][0],
        ):
            out.append({"text": doc, "metadata": meta, "distance": dist})
        return out

    def reset_collection(self, collection_name: str) -> None:
        try:
            self._client.delete_collection(collection_name)
        except Exception:
            pass
        self._collections.pop(collection_name, None)
