"""CLI: python -m app.cli.chat [--demo]"""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

DEMO_QUERIES = [
    {
        "id": "Q1",
        "query": "For client Aurora Paints, what is the maximum zinc content allowed in the finished EcoSafe Interior Wall Paint for the EU?",
        "client": "Aurora Paints",
    },
    {
        "id": "Q2",
        "query": "For client Aurora Paints, considering EcoSafe Ceiling Paint, EcoSafe Exterior Facade and EcoShield Floor Coating in the EU, what is the maximum internal VOC limit in g/L across these products?",
        "client": "Aurora Paints",
    },
    {
        "id": "Q3",
        "query": "According to the guidance for client Horizon Coatings' UltraSafe Interior Wall Paint, in which types of rooms is enhanced ventilation or longer airing-out periods specifically recommended?",
        "client": "Horizon Coatings",
    },
    {
        "id": "Q4",
        "query": "Comparing client Aurora Paints and client Horizon Coatings, which client sets a stricter VOC limit for interior wall paint in the EU, and what additional usage guidance is mentioned for sensitive environments across their products?",
        "clients": ["Aurora Paints", "Horizon Coatings"],
    },
    {
        "id": "Q5",
        "query": "For client Aurora Paints, what internal VOC limit in g/L is set for EcoSafe Kitchen & Bath in the EU for typical residential projects?",
        "client": "Aurora Paints",
    },
]


def run_query(query_info: dict, structured, vector) -> dict:
    from ..retrieval.router import route
    from ..retrieval.compose import compose_answer

    query = query_info["query"]
    client = query_info.get("client")
    clients = query_info.get("clients")

    if clients and len(clients) == 1:
        client = clients[0]
        clients = None

    route_decision = route(query, client_hint=client, clients_hint=clients)
    result = compose_answer(query=query, route=route_decision, structured=structured, vector=vector)

    return {
        "id": query_info["id"],
        "query": query,
        "route": result["route"],
        "answer": result["answer"],
        "sources": [s["ref"] for s in result["sources"][:5]],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="Run the 5 demo queries")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(os.environ.get("DATA_DIR", "/host/ai-company/pwc-rag-task/app/data")),
    )
    args = parser.parse_args()

    db_path = args.data_dir / "structured.duckdb"
    chroma_path = args.data_dir / "chroma"

    from ..stores.structured import StructuredStore
    from ..stores.vector import VectorStore

    structured = StructuredStore(db_path)
    vector = VectorStore(chroma_path)

    if args.demo:
        print("# PwC RAG Demo — 5 Golden Queries\n")
        for q_info in DEMO_QUERIES:
            print(f"## {q_info['id']}: {q_info['query'][:80]}...\n")
            result = run_query(q_info, structured, vector)
            print(f"**Route:** structured={result['route']['use_structured']} unstructured={result['route']['use_unstructured']}")
            print(f"**Answer:** {result['answer']}\n")
            print(f"**Sources:** {', '.join(result['sources'])}\n")
            print("---\n")
    else:
        # Interactive REPL
        print("PwC RAG CLI — type 'quit' to exit")
        session_id = None
        from ..api.sessions import SessionStore
        sessions = SessionStore()
        session = sessions.create()

        while True:
            try:
                query = input("Query> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if query.lower() in ("quit", "exit", "q"):
                break
            client = input("Client (Aurora Paints / Horizon Coatings)> ").strip() or "Aurora Paints"

            from ..retrieval.router import route
            from ..retrieval.compose import compose_answer

            rd = route(query, client_hint=client)
            result = compose_answer(query, rd, structured, vector, memory=session.get_memory())
            session.add_turn(query, result["answer"])

            print(f"\nAnswer: {result['answer']}\n")
            print(f"Route: {result['route']}")
            print(f"Sources: {[s['ref'] for s in result['sources'][:3]]}\n")


if __name__ == "__main__":
    main()
