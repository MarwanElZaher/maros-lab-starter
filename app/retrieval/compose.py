"""Answer composition with citations."""
from __future__ import annotations
import logging
from .router import RouteDecision
from ..stores.structured import StructuredStore
from ..stores.vector import VectorStore
from .structured import retrieve_structured
from .unstructured import retrieve_unstructured
from ..llm.client import chat_text
from ..llm.prompts import COMPOSER_SYSTEM, COMPOSER_USER_TEMPLATE

logger = logging.getLogger(__name__)


def _fmt_structured(rows: list[dict], client: str) -> str:
    if not rows:
        return f"No structured spec data found for {client}."
    # Deduplicate by (product, region, parameter, value, unit) to avoid flooding
    # the LLM with identical rows that occur when the xlsx has repeated entries.
    seen: set = set()
    unique: list[dict] = []
    for r in rows:
        key = (r.get("product"), r.get("region"), r.get("parameter"), r.get("value"), r.get("unit"))
        if key not in seen:
            seen.add(key)
            unique.append(r)
    lines = [f"[{client} specs — {len(unique)} unique rows]"]
    for r in unique:
        lines.append(
            f"  product={r.get('product')} region={r.get('region')} "
            f"param={r.get('parameter')} value={r.get('value')} {r.get('unit')} "
            f"limit_type={r.get('limit_type')} | "
            f"source={r.get('source_file')} {r.get('source_locator')}"
        )
    return "\n".join(lines)


def _fmt_unstructured(chunks: list[dict], client: str) -> str:
    if not chunks:
        return f"No narrative data found for {client}."
    lines = [f"[{client} narrative]"]
    for c in chunks:
        meta = c.get("metadata", {})
        lines.append(
            f"  [{meta.get('source_file','?')} {meta.get('source_locator','?')}] "
            f"{c.get('text','')[:300]}"
        )
    return "\n".join(lines)


def compose_answer(
    query: str,
    route: RouteDecision,
    structured: StructuredStore,
    vector: VectorStore,
    memory: list[dict] | None = None,
) -> dict:
    """
    Retrieve from appropriate stores (one per client for comparison queries),
    compose a cited LLM answer.
    Returns {answer, route, sources}.
    """
    struct_ctx_parts: list[str] = []
    unstruct_ctx_parts: list[str] = []
    all_sources: list[dict] = []

    clients = route.clients if route.clients else ([route.client_filter] if route.client_filter else [])

    if not clients:
        clients = ["Aurora Paints"]  # fallback

    for client in clients:
        if route.use_structured:
            rows = retrieve_structured(
                structured,
                client=client,
                query=query,
                products=route.products,
                regions=route.regions,
            )
            struct_ctx_parts.append(_fmt_structured(rows, client))
            for r in rows:
                all_sources.append(
                    {
                        "type": "structured",
                        "client": client,
                        "ref": f"{r.get('source_file')} {r.get('source_locator')}",
                        "snippet": (
                            f"param={r.get('parameter')} value={r.get('value')} "
                            f"{r.get('unit')} product={r.get('product')} region={r.get('region')}"
                        ),
                    }
                )

        if route.use_unstructured:
            chunks = retrieve_unstructured(vector, client=client, query=query)
            unstruct_ctx_parts.append(_fmt_unstructured(chunks, client))
            for c in chunks:
                meta = c.get("metadata", {})
                all_sources.append(
                    {
                        "type": "unstructured",
                        "client": client,
                        "ref": f"{meta.get('source_file','?')} {meta.get('source_locator','?')}",
                        "snippet": c.get("text", "")[:200],
                    }
                )

    structured_ctx = "\n\n".join(struct_ctx_parts) if struct_ctx_parts else "Not retrieved."
    unstructured_ctx = "\n\n".join(unstruct_ctx_parts) if unstruct_ctx_parts else "Not retrieved."
    client_context = ", ".join(clients)

    user_msg = COMPOSER_USER_TEMPLATE.format(
        query=query,
        client_context=client_context,
        structured_context=structured_ctx,
        unstructured_context=unstructured_ctx,
    )

    messages: list[dict] = [{"role": "system", "content": COMPOSER_SYSTEM}]
    if memory:
        messages.extend(memory)
    messages.append({"role": "user", "content": user_msg})

    answer = chat_text(messages)

    return {
        "answer": answer,
        "route": {
            "use_structured": route.use_structured,
            "use_unstructured": route.use_unstructured,
            "reasoning": route.reasoning,
        },
        "sources": all_sources,
    }
