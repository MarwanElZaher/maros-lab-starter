# Learning Notes — Interview Talking Points

## Router Design

**Why hybrid?**
Rule-based prefilter handles 80% of cases deterministically: a query with numbers/units/VOC → structured; a query with "guidance/recommend/ventilation" → unstructured. The LLM second pass handles the ambiguous 20% (e.g., "what are the usage guidelines for the product with the lowest VOC limit?"). Hybrid is the right pattern because rules are fast and free, LLM adds precision for edge cases.

**Trade-offs in this approach:**
- Rule-based is brittle (misses synonyms). Production fix: use an embeddings-based intent classifier instead.
- Both-stores-always is safe but expensive. For a prototype, "when in doubt, use both" is the right default.

## Why DuckDB?

1. **Analytical queries out of the box**: `SELECT MAX(value) FROM specs WHERE client=? AND parameter LIKE '%voc%'` runs in microseconds.
2. **No server process**: single file, ships with the app, no infrastructure setup for a demo.
3. **Parameterised binding**: prevents SQL injection. Every `WHERE client=?` is a bound parameter, never an f-string.
4. **Production note**: for concurrent writes, migrate to PostgreSQL. DuckDB has a single-writer model.

## Per-Client ChromaDB Collections

**Why physical isolation (not metadata filter)?**
A metadata filter (`WHERE metadata.client == 'Aurora'`) is a query-time filter. A bug in the retrieval code, a forgotten filter argument, or a library API change could return unfiltered results. Separate collections make it structurally impossible — you cannot accidentally query `narrative_horizon` from Aurora's retrieval path.

**Trade-off**: more collections to manage, more memory. For 10 clients this is fine. For 1000 clients, use a single collection with metadata + hybrid encryption at the field level.

## Isolation Under SQL Injection

Key insight: **parameterised binding is a database contract, not a string escape**. When you write `WHERE client = ?` and pass `"Aurora'; DROP TABLE specs; --"` as the parameter, DuckDB never interprets it as SQL. It's sent as a typed value. No escaping, no regex sanitisation needed.

The injection test in `test_isolation.py` passes hostile payloads and verifies:
1. No exception raised (binding handles it silently)
2. Returns empty rows (no match for the hostile string)
3. Table still intact after multiple hostile queries

## Q4 Two-Independent-Retrievals Architecture

For comparison queries, a single retrieval over a union would let the relevance scores interact. Aurora's VOC specs might crowd out Horizon's narrative, or vice versa. Instead:
1. Call retrieval once for Aurora → get Aurora specs + narrative
2. Call retrieval once for Horizon → get Horizon specs + narrative
3. Composer receives both result sets with explicit client labels
4. LLM compares them with full context for each

This also ensures client isolation: each retrieval call is hard-scoped to one client.

## Production Gaps

1. **Session storage**: Redis with TTL instead of in-process dict
2. **Embedding caching**: Model weights downloaded on first use — use a model server (Triton) or pre-baked Docker layer
3. **LLM reliability**: Free tier has rate limits and model churn. Use a paid API with SLA.
4. **Authentication**: JWT middleware so `client` comes from the auth token, not the request body (user cannot spoof a different client)
5. **Reranker**: Add cross-encoder (BGE reranker) for top-20 → top-5 precision improvement
6. **Observability**: Log every query, route decision, source references, and LLM call for audit trail
7. **Async**: The current compose is synchronous. For production, use async LLM calls to serve multiple users concurrently.
