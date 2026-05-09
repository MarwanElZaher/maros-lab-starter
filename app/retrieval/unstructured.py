"""Unstructured retrieval — Chroma vector search."""
from __future__ import annotations
from ..stores.vector import VectorStore
from ..ingest.schemas import CLIENT_CONFIGS

_CLIENT_TO_COLLECTION = {
    cfg["name"]: cfg["chroma_collection"]
    for cfg in CLIENT_CONFIGS.values()
}


def get_collection_name(client: str) -> str:
    for name, col in _CLIENT_TO_COLLECTION.items():
        if client.lower() in name.lower() or name.lower() in client.lower():
            return col
    # Fallback: slugify
    return "narrative_" + client.lower().replace(" ", "_")


def retrieve_unstructured(
    vector: VectorStore,
    client: str,
    query: str,
    n_results: int = 8,
) -> list[dict]:
    """Return top-n narrative chunks for the given client."""
    collection = get_collection_name(client)
    results = vector.query(collection, query, n_results=n_results)
    return results
