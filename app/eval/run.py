#!/usr/bin/env python
"""
Eval runner — reads golden.yaml, runs queries, prints a markdown table.
Exits non-zero if any query fails.
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

import yaml

# Add app root to path
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

GOLDEN_PATH = Path(__file__).parent / "golden.yaml"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(REPO_ROOT / "data")))


def load_golden() -> list[dict]:
    with open(GOLDEN_PATH) as f:
        return yaml.safe_load(f)


def run_query(entry: dict, structured, vector) -> dict:
    from app.retrieval.router import route as do_route
    from app.retrieval.compose import compose_answer

    query = entry["query"]
    client = entry.get("client")
    clients = entry.get("clients")

    if clients and len(clients) == 1:
        client = clients[0]
        clients = None

    route_decision = do_route(query, client_hint=client, clients_hint=clients)
    result = compose_answer(query=query, route=route_decision, structured=structured, vector=vector)

    return {
        "id": entry["id"],
        "query": query,
        "route": result["route"],
        "answer": result["answer"],
        "sources": result["sources"],
    }


def check_result(entry: dict, result: dict) -> tuple[bool, list[str]]:
    failures: list[str] = []
    answer = result["answer"]
    answer_lower = answer.lower()
    route = result["route"]
    sources_text = " ".join(
        s.get("ref", "") + " " + s.get("snippet", "")
        for s in result.get("sources", [])
    ).lower()

    expected_route = entry.get("expected_route", {})
    if "use_structured" in expected_route:
        if route.get("use_structured") != expected_route["use_structured"]:
            failures.append(
                f"route.use_structured={route.get('use_structured')} expected={expected_route['use_structured']}"
            )
    if "use_unstructured" in expected_route:
        if route.get("use_unstructured") != expected_route["use_unstructured"]:
            failures.append(
                f"route.use_unstructured={route.get('use_unstructured')} expected={expected_route['use_unstructured']}"
            )

    for sub in entry.get("expected_substrings", []):
        if sub.lower() not in answer_lower:
            failures.append(f"missing expected substring: {sub!r}")

    for banned in entry.get("must_not_contain", []):
        if banned.lower() in answer_lower:
            failures.append(f"answer contains banned string: {banned!r}")

    for src in entry.get("expected_sources_at_least", []):
        if src.lower() not in sources_text:
            failures.append(f"missing expected source: {src!r}")

    return len(failures) == 0, failures


def main() -> int:
    from app.stores.structured import StructuredStore
    from app.stores.vector import VectorStore

    db_path = DATA_DIR / "structured.duckdb"
    chroma_path = DATA_DIR / "chroma"

    if not db_path.exists():
        print("ERROR: structured.duckdb not found. Run 'make ingest' first.", file=sys.stderr)
        return 1

    structured = StructuredStore(db_path)
    vector = VectorStore(chroma_path)

    entries = load_golden()
    all_passed = True

    print("# PwC RAG Eval\n")
    print("| ID | Query | Route | Passed | Notes |")
    print("|----|-------|-------|--------|-------|")

    for entry in entries:
        try:
            result = run_query(entry, structured, vector)
            passed, failures = check_result(entry, result)
        except Exception as e:
            import traceback
            traceback.print_exc()
            passed = False
            failures = [f"Exception: {e}"]
            result = {"answer": "", "route": {}, "sources": []}

        if not passed:
            all_passed = False

        status = "PASS" if passed else "FAIL"
        route_str = (
            f"S={result['route'].get('use_structured',False)}"
            f" U={result['route'].get('use_unstructured',False)}"
        )
        notes = "; ".join(failures) if failures else "OK"
        q_short = entry["query"][:55].replace("|", " ")

        print(f"| {entry['id']} | {q_short}... | {route_str} | {status} | {notes} |")
        print(f"\n**{entry['id']} answer:** {result.get('answer','')[:300]}\n")

    print("\n---")
    if all_passed:
        print("All 5 queries passed.")
        return 0
    else:
        print("FAILED — see table above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
