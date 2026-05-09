"""Hybrid rule-based + LLM router."""
from __future__ import annotations
import re
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Rule-based triggers
_STRUCTURED_KEYWORDS = re.compile(
    r"\b(voc|lead|zinc|cadmium|limit|g/l|g/kg|mg/kg|ppm|ppb|value|content|"
    r"maximum|minimum|allow|permit|exceed|compl|spec|limit|"
    r"how much|what is the max|what is the min|aggregat|"
    r"compar|stricter|higher|lower|roof)\b",
    re.IGNORECASE,
)

_UNSTRUCTURED_KEYWORDS = re.compile(
    r"\b(guidance|recommend|ventilat|airing|policy|narrative|usage|"
    r"instruction|sensitive|hospital|care|environment|how to|"
    r"when to use|where to use|which room|which type|"
    r"additional|inform|brief|document|story)\b",
    re.IGNORECASE,
)

_COMPARISON_KEYWORDS = re.compile(
    r"\b(compar|both client|between client|vs\.|versus|which client|"
    r"across client|client aurora.*client horizon|client horizon.*client aurora)\b",
    re.IGNORECASE,
)


@dataclass
class RouteDecision:
    use_structured: bool
    use_unstructured: bool
    client_filter: str | None
    clients: list[str] | None
    products: list[str] | None
    regions: list[str] | None
    reasoning: str


def route(query: str, client_hint: str | None = None, clients_hint: list[str] | None = None) -> RouteDecision:
    """Hybrid router: fast rule prefilter + LLM second pass."""
    use_structured = bool(_STRUCTURED_KEYWORDS.search(query))
    use_unstructured = bool(_UNSTRUCTURED_KEYWORDS.search(query))
    is_comparison = bool(_COMPARISON_KEYWORDS.search(query))

    # Safe default: include both when ambiguous
    if not use_structured and not use_unstructured:
        use_structured = True
        use_unstructured = True

    # Rule-based is the primary path (LLM routing disabled to conserve rate limits)
    # Products and regions are extracted from the query heuristically
    client_filter = client_hint
    clients = clients_hint
    products = _extract_products(query)
    regions = _extract_regions(query)
    reasoning = "Rule-based routing"

    # Comparison queries must fetch both clients
    if is_comparison and clients_hint:
        clients = clients_hint
        client_filter = None

    return RouteDecision(
        use_structured=use_structured,
        use_unstructured=use_unstructured,
        client_filter=client_filter,
        clients=clients,
        products=products,
        regions=regions,
        reasoning=reasoning,
    )


def _extract_products(query: str) -> list[str] | None:
    """Heuristically extract product names from query."""
    known_products = [
        "EcoSafe Interior Wall Paint", "EcoSafe Ceiling Paint",
        "EcoSafe Exterior Facade", "EcoShield Floor Coating",
        "EcoSafe Kitchen & Bath", "EcoSafe Kitchen and Bath",
        "UltraSafe Interior Wall Paint", "UltraShield Primer",
    ]
    found = [p for p in known_products if p.lower() in query.lower()]
    return found if found else None


def _extract_regions(query: str) -> list[str] | None:
    """Heuristically extract region names from query."""
    regions = []
    q = query.upper()
    if " EU" in q or "EU " in q or "EUROPEAN" in q:
        regions.append("EU")
    if " US " in q or "UNITED STATES" in q:
        regions.append("US")
    if "GCC" in q:
        regions.append("GCC")
    return regions if regions else None


def _llm_route(query: str) -> dict | None:
    from ..llm.client import chat_json
    from ..llm.prompts import ROUTER_SYSTEM

    try:
        result = chat_json(
            [
                {"role": "system", "content": ROUTER_SYSTEM},
                {"role": "user", "content": f"Route this query: {query}"},
            ]
        )
        return result
    except Exception as e:
        logger.warning(f"LLM router error: {e}")
        return None
