"""FastAPI application — entry point."""
from __future__ import annotations
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from .sessions import SessionStore
from ..retrieval.router import route
from ..retrieval.compose import compose_answer
from ..stores.structured import StructuredStore
from ..stores.vector import VectorStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = Path(os.environ.get("DATA_DIR", "/host/ai-company/pwc-rag-task/app/data"))
DB_PATH = DATA_DIR / "structured.duckdb"
CHROMA_PATH = DATA_DIR / "chroma"

app = FastAPI(title="PwC RAG Prototype", version="0.1.0")

# Lazy-init stores
_structured: StructuredStore | None = None
_vector: VectorStore | None = None
_sessions = SessionStore()


def get_stores() -> tuple[StructuredStore, VectorStore]:
    global _structured, _vector
    if _structured is None:
        _structured = StructuredStore(DB_PATH)
    if _vector is None:
        _vector = VectorStore(CHROMA_PATH)
    return _structured, _vector


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SessionResponse(BaseModel):
    session_id: str


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str
    client: str | None = None
    clients: list[str] | None = None


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    route: dict
    sources: list[dict]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/sessions", response_model=SessionResponse)
def create_session():
    session = _sessions.create()
    return {"session_id": session.session_id}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    structured, vector = get_stores()
    session = _sessions.get_or_create(req.session_id)

    # Determine client(s)
    client_filter = req.client
    clients = req.clients
    if clients and len(clients) == 1:
        client_filter = clients[0]
        clients = None

    route_decision = route(
        req.message,
        client_hint=client_filter,
        clients_hint=clients,
    )

    result = compose_answer(
        query=req.message,
        route=route_decision,
        structured=structured,
        vector=vector,
        memory=session.get_memory(),
    )

    session.add_turn(req.message, result["answer"])

    return {
        "session_id": session.session_id,
        "answer": result["answer"],
        "route": result["route"],
        "sources": result["sources"],
    }


@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    from .sse import stream_answer

    structured, vector = get_stores()
    session = _sessions.get_or_create(req.session_id)

    client_filter = req.client
    clients = req.clients
    if clients and len(clients) == 1:
        client_filter = clients[0]
        clients = None

    route_decision = route(
        req.message,
        client_hint=client_filter,
        clients_hint=clients,
    )

    memory = session.get_memory()

    async def generator():
        full_answer = ""
        async for event in stream_answer(
            query=req.message,
            route_decision=route_decision,
            structured_store=structured,
            vector_store=vector,
            memory=memory,
        ):
            if event["event"] == "done":
                data = __import__("json").loads(event["data"])
                full_answer = data.get("answer", "")
            yield event

        session.add_turn(req.message, full_answer)

    return EventSourceResponse(generator())
