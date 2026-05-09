"""Structured retrieval — parameterized DuckDB queries."""
from __future__ import annotations
from pathlib import Path
from ..stores.structured import StructuredStore


def retrieve_structured(
    store: StructuredStore,
    client: str,
    query: str,
    products: list[str] | None = None,
    regions: list[str] | None = None,
    limit: int = 20,
) -> list[dict]:
    """
    Return spec rows for the given client.
    Uses parameterized queries only — never f-strings for client.
    """
    # Extract parameter keywords from query for filtering
    parameters = _extract_param_keywords(query)

    rows = store.search_specs(
        client=client,
        products=products,
        regions=regions,
        parameters=parameters if parameters else None,
        limit=limit,
    )

    # Fall back to all specs only when no parameter keyword was extracted (ambiguous query).
    # When a specific parameter (e.g. "zinc") was searched and returned empty, do NOT fall
    # back — empty means the parameter genuinely has no data for this client/product.
    if not rows and not parameters:
        rows = store.search_specs(client=client, products=products, regions=regions, limit=limit)

    return rows


_PARAM_PATTERNS = [
    "voc", "lead", "zinc", "cadmium", "drying", "ventilation", "flash",
    "viscosity", "coverage", "solids", "arsenic", "chromium", "mercury",
]


def _extract_param_keywords(query: str) -> list[str]:
    query_lower = query.lower()
    return [p for p in _PARAM_PATTERNS if p in query_lower]
