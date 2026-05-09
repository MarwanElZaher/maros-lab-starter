"""SSE streaming helpers for FastAPI."""
from __future__ import annotations
import json
from typing import AsyncIterator
from sse_starlette.sse import EventSourceResponse


def make_sse_event(event_type: str, data: object) -> dict:
    return {"event": event_type, "data": json.dumps(data)}


async def stream_answer(
    query: str,
    route_decision,
    structured_store,
    vector_store,
    memory: list[dict],
) -> AsyncIterator[dict]:
    from ..retrieval.compose import (
        retrieve_structured,
        retrieve_unstructured,
        _fmt_structured,
        _fmt_unstructured,
    )
    from ..llm.client import chat_stream
    from ..llm.prompts import COMPOSER_SYSTEM, COMPOSER_USER_TEMPLATE

    clients = route_decision.clients if route_decision.clients else (
        [route_decision.client_filter] if route_decision.client_filter else ["Aurora Paints"]
    )

    # Emit route event
    yield make_sse_event(
        "route",
        {
            "use_structured": route_decision.use_structured,
            "use_unstructured": route_decision.use_unstructured,
            "reasoning": route_decision.reasoning,
        },
    )

    struct_parts: list[str] = []
    unstruct_parts: list[str] = []
    all_sources: list[dict] = []

    for client in clients:
        if route_decision.use_structured:
            rows = retrieve_structured(structured_store, client=client, query=query)
            struct_parts.append(_fmt_structured(rows, client))
            for r in rows:
                src = {
                    "type": "structured",
                    "client": client,
                    "ref": f"{r.get('source_file')} {r.get('source_locator')}",
                    "snippet": f"param={r.get('parameter')} value={r.get('value')} {r.get('unit')}",
                }
                all_sources.append(src)
                yield make_sse_event("source", src)

        if route_decision.use_unstructured:
            chunks = retrieve_unstructured(vector_store, client=client, query=query)
            unstruct_parts.append(_fmt_unstructured(chunks, client))
            for c in chunks:
                meta = c.get("metadata", {})
                src = {
                    "type": "unstructured",
                    "client": client,
                    "ref": f"{meta.get('source_file','?')} {meta.get('source_locator','?')}",
                    "snippet": c.get("text", "")[:200],
                }
                all_sources.append(src)
                yield make_sse_event("source", src)

    user_msg = COMPOSER_USER_TEMPLATE.format(
        query=query,
        client_context=", ".join(clients),
        structured_context="\n\n".join(struct_parts) or "Not retrieved.",
        unstructured_context="\n\n".join(unstruct_parts) or "Not retrieved.",
    )

    messages: list[dict] = [{"role": "system", "content": COMPOSER_SYSTEM}]
    messages.extend(memory)
    messages.append({"role": "user", "content": user_msg})

    full_answer = ""
    async for token in chat_stream(messages):
        full_answer += token
        yield make_sse_event("token", {"text": token})

    yield make_sse_event("done", {"answer": full_answer, "sources": all_sources})
