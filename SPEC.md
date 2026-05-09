# PwC Senior AI Engineer Take-Home — Multi-Source Document Retrieval (RAG)

**Submitted by:** Marwan El Zaher (CEO, maroslab) — for a PwC technical interview
**Owner team:** maroslab paperclip
**Working directory inside container:** `/host/ai-company/pwc-rag-task/`
**Output codebase directory:** `/host/ai-company/pwc-rag-task/app/`
**Source files (read-only inputs):** `/host/ai-company/pwc-rag-task/sources/`
- `PwC_Senior_AI_Engineer_Document_Retrieval_Task.pdf` — full task brief (read first)
- `aurora_product_data.xlsx` — Aurora structured specs
- `aurora_product_brief.docx` — Aurora narrative + inline specs + embedded image
- `horizon_product_data.xlsx` — Horizon structured specs (different schema from Aurora)
- `horizon_product_brief.docx` — Horizon narrative + inline specs + embedded image

## 1. Business goal (one paragraph)
PwC consultants and client compliance officers need a single chat interface that answers natural-language questions over a mix of **structured spec rows** (from xlsx) and **unstructured regulatory/usage narrative** (from docx) belonging to multiple clients. Each client's data must be strictly isolated. The prototype must demonstrate ingestion → store separation → query routing → cited answers → conversational memory.

## 2. Hard requirements (from PwC brief)
1. Ingest all 4 data files (2 xlsx + 2 docx) — schemas differ per client.
2. Separate content into **structured store** (specs) and **unstructured store** (narrative). Heuristic is your choice; you must be able to defend it.
3. Word docs contain at least one **inline spec entry** that matches that client's xlsx schema — extract those into the structured store too (don't just dump docx into the vector store).
4. NL query → automatic **router** decides: structured only / unstructured only / both. Explain trade-offs in README.
5. **Strict client isolation:** Aurora's data must never appear in a Horizon answer and vice versa. For this prototype the client name is passed in the query (in production it would come from session).
6. **Conversational memory** with sessions — multi-turn, not one-shot.
7. Answers must show **sources** (which rows / which docx paragraphs / which file).
8. Free LLM API allowed — use **OpenRouter** (`OPENROUTER_API_KEY` is already in container env). Pick a free-tier model that supports JSON tool-calling (e.g. `qwen/qwen-2.5-72b-instruct:free`, `meta-llama/llama-3.1-70b-instruct:free`, or whichever is currently free and JSON-capable; verify at runtime).
9. **The 5 demo queries** in section §4.3 of the brief must all pass an automated eval.

### Bonus (do all three — they score points and harden the system)
- **Streaming answers** via SSE on the FastAPI endpoint.
- **Multilingual support** — at minimum auto-detect query language and instruct the LLM to answer in that language; embeddings model must be multilingual (use `intfloat/multilingual-e5-base` or `BAAI/bge-m3`).
- **Image-aware ingestion** — extract embedded images from each docx, OCR with `pytesseract`, treat extracted text as additional source rows tagged `source_type=image_ocr`.

## 3. Recommended technical design (defend in README — change only with reason)

### 3.1 Stack
- **Language:** Python 3.11
- **Package manager:** `uv` (fast) or `pip + venv` — pin in `pyproject.toml`
- **HTTP API:** FastAPI + uvicorn (SSE streaming)
- **Structured store:** **DuckDB** file-backed (`data/structured.duckdb`). Single canonical table `specs` with unified schema. DuckDB beats SQLite for analytical aggregations (the demo queries do `MAX` across products).
- **Unstructured store:** **ChromaDB** persistent client (`data/chroma/`). Per-client collection (`narrative_aurora`, `narrative_horizon`) — physical isolation, not just metadata filter.
- **Embeddings:** `BAAI/bge-m3` (multilingual, free, runs on CPU) via `sentence-transformers`. Falls back to `intfloat/multilingual-e5-base` if bge-m3 too heavy.
- **Reranker (optional, recommended):** `BAAI/bge-reranker-v2-m3` cross-encoder on top-20 → top-5.
- **LLM client:** OpenAI SDK pointed at OpenRouter (`OPENAI_BASE_URL=https://openrouter.ai/api/v1`, `OPENAI_API_KEY=$OPENROUTER_API_KEY`).
- **Image OCR:** `python-docx` (extract images from `.docx` zip), `Pillow`, `pytesseract` (system `tesseract-ocr` package).
- **DOCX text:** `python-docx` for paragraphs/runs; treat bullets/tables/inline text uniformly.
- **Memory:** in-process `dict[session_id, deque[Message]]` with TTL — production note in README that this would move to Redis.
- **Router:** Hybrid — fast rule-based prefilter (numbers/units/comparators ⇒ include structured; words like "guidance/ventilation/recommend/policy" ⇒ include unstructured) + LLM second-pass with strict JSON schema (`{"use_structured": bool, "use_unstructured": bool, "client_filter": str|null, "products": str[]|null, "regions": str[]|null}`). Document why hybrid: rules are deterministic on the obvious cases, LLM handles ambiguity, both is the safe default.

### 3.2 Unified spec schema (target shape after mapping)
```
client          TEXT    -- "Aurora Paints" | "Horizon Coatings"
product         TEXT
region          TEXT    -- "EU" | "US" | "GCC" | ...
parameter       TEXT    -- "max_voc_content", "max_lead_content", ...
value           DOUBLE
unit            TEXT
limit_type      TEXT    -- internal_limit / illustrative_internal_limit / application_guideline / ...
notes           TEXT
source_file     TEXT    -- e.g. aurora_product_data.xlsx
source_locator  TEXT    -- e.g. "row=42" or "docx_para=17" or "image_ocr"
ingested_at     TIMESTAMP
```
Aurora columns (`client_name, product_name, region, parameter, value, unit, limit_type, notes`) and Horizon columns (`supplier_name, product_line, market, metric, metric_value, metric_unit, classification, remarks`) are mapped through a **per-client column map** declared in `app/ingest/schemas.py`. Add a unit test for each mapping.

### 3.3 Inline-spec extraction from docx
Detect spec-shaped sentences with a regex pattern that requires **(a) a numeric value with unit, (b) a parameter keyword from a known vocabulary** (`VOC, lead, zinc, cadmium, drying time, ventilation period…`). Push matches into `specs` with `source_locator=docx_para=<n>`. Push **all** docx paragraphs (specs included) into the vector store too — duplicates are fine; the router will handle weighting.

### 3.4 Client isolation enforcement
- Two separate Chroma collections (one per client) — there is no API path that returns cross-client rows.
- DuckDB queries always include `WHERE client = ?` — bind the client name from the session. **Never** interpolate it via f-string. Add a unit test that issues a query with `client="Aurora Paints'; --"` and verifies the parameterized binding rejects it.
- The retrieval layer takes `client: str` as a required argument — no default. The CLI/API layer is the only place that resolves session → client.
- For **comparison queries** (Q4) the API accepts `clients: list[str]` and runs the retrieval **independently per client**, then the answer-composer combines results client-tagged. Never run a single retrieval over union of clients.

### 3.5 Conversational memory
- `POST /sessions` returns `{session_id}`.
- `POST /chat` body: `{session_id, message, client}` (or `clients` for comparison mode).
- Memory rolls last N=8 turns into the prompt. System prompt is regenerated each turn with the client constraint inlined.

### 3.6 API
- `POST /sessions` → create
- `POST /chat` → non-streaming JSON answer
- `POST /chat/stream` → SSE; events `token`, `route`, `source`, `done`, `error`
- `GET /health` → `{ok: true}`
- Always return `{answer, route: {use_structured, use_unstructured, reasoning}, sources: [{type, ref, snippet}]}` — even in streaming, send the routing decision and sources as named SSE events before tokens.

### 3.7 Repository layout
```
app/
  ingest/
    __init__.py
    excel.py          # xlsx → unified rows
    docx_parse.py     # docx → paragraphs + embedded images
    inline_specs.py   # regex/keyword extractor for spec-shaped sentences
    image_ocr.py      # pytesseract pipeline
    schemas.py        # per-client column maps + unified schema
    pipeline.py       # ingest_all() orchestrator
  stores/
    structured.py     # DuckDB wrapper
    vector.py         # Chroma wrapper, per-client collection naming
  retrieval/
    router.py         # hybrid rule+LLM router
    structured.py     # SQL templating (parameterized)
    unstructured.py   # vector + rerank
    compose.py        # final answer composition with citations
  llm/
    client.py         # OpenRouter via OpenAI SDK
    prompts.py        # system prompts (router, composer)
  api/
    main.py           # FastAPI app
    sse.py            # streaming helpers
    sessions.py       # in-memory session store
  cli/
    ingest.py         # python -m app.cli.ingest
    chat.py           # interactive REPL
data/
  structured.duckdb
  chroma/
tests/
  test_ingest_excel.py
  test_ingest_docx.py
  test_inline_specs.py
  test_router.py
  test_isolation.py     # the SQL injection test + cross-client leak test
  test_e2e_queries.py   # the 5 demo queries with golden expectations
eval/
  golden.yaml           # 5 queries + expected substrings + expected route + expected sources
  run.py                # pytest-style runner that prints a markdown table
README.md
ARCHITECTURE.md         # mermaid diagram + design decisions
Makefile                # ingest, test, eval, serve, demo
pyproject.toml
.env.example
```

### 3.8 Makefile targets
- `make setup` → create venv, install deps, install tesseract via apt if missing
- `make ingest` → run ingestion against `/host/ai-company/pwc-rag-task/sources/`
- `make test` → unit tests
- `make eval` → run golden-set evaluation; **must exit non-zero on any failure**
- `make serve` → uvicorn on `0.0.0.0:8088`
- `make demo` → run the 5 queries through the CLI and print structured output (used in the recorded video)

## 4. The 5 demo queries (eval golden set)
For each, store: `query`, `client(s)`, `expected_route`, `expected_substrings`, `expected_sources_at_least`.

**Q1 — trick / isolation test:** "For client Aurora Paints, what is the maximum zinc content allowed in the finished EcoSafe Interior Wall Paint for the EU?"
- Aurora's xlsx has VOC + lead, **not zinc** (Horizon has zinc). Correct answer: "No zinc limit is recorded for Aurora Paints' EcoSafe Interior Wall Paint in the EU." → must NOT leak Horizon's 0.02% zinc value.

**Q2 — aggregation across products:** "For client Aurora Paints, considering EcoSafe Ceiling Paint, EcoSafe Exterior Facade and EcoShield Floor Coating in the EU, what is the maximum internal VOC limit in g/L across these products?"
- Structured-only. Expected: 40 g/L (EcoShield Floor Coating, EU). Source: row in aurora_product_data.xlsx.

**Q3 — narrative retrieval:** "According to the guidance for client Horizon Coatings' UltraSafe Interior Wall Paint, in which types of rooms is enhanced ventilation or longer airing-out periods specifically recommended?"
- Unstructured-only. Expected substrings: "hospitals", "long-term care homes", "elderly care facilities", "underground rooms".

**Q4 — comparison + multi-store:** "Comparing client Aurora Paints and client Horizon Coatings, which client sets a stricter VOC limit for interior wall paint in the EU, and what additional usage guidance is mentioned for sensitive environments across their products?"
- Both stores, both clients. Expected: Horizon stricter (25 g/L vs Aurora 30 g/L). Plus narrative on sensitive environments. **Architecture must show two independent retrievals (one per client) merged at compose-time.**

**Q5 — narrative-vs-structured divergence:** "For client Aurora Paints, what internal VOC limit in g/L is set for EcoSafe Kitchen & Bath in the EU for typical residential projects?"
- Trick: docx says **32 g/L**, xlsx has 36 g/L (illustrative for GCC, not EU). Correct answer pulls from the docx (narrative is more specific to "EU, typical residential"). **Answer must cite which source it chose and why** — this is the explainability acceptance bar.

## 5. Acceptance criteria (gate for "done")
1. `make setup && make ingest && make test && make eval` is green from a clean clone.
2. `make eval` prints a markdown table with one row per query: `query | route | answer | sources | passed`. All 5 pass.
3. Cross-client leak test (`tests/test_isolation.py`): given query for Aurora about zinc, the system response must not contain the string "0.02" or "Horizon" or "UltraSafe". Test must fail loudly if it does.
4. `make serve` boots, `/health` returns 200, and `POST /chat` for Q3 returns the expected substrings.
5. README has: architecture mermaid, how to run, design decisions, router rules, isolation strategy, what would change for production, brief explanation per bonus.
6. ARCHITECTURE.md has the mermaid diagram exported as `architecture.png` (or skip and embed mermaid — fine).
7. No secrets in git. `.env.example` only.

## 6. Workflow for the paperclip team
- **PO:** read `sources/PwC_*.pdf` first (full brief). Then read this SPEC. Open clarifying questions only on ambiguity not covered here.
- **Engineer:** implement under `/host/ai-company/pwc-rag-task/app/`. Initialize a fresh git repo there (`git init`); commit per logical chunk.
- **QA:** write the eval harness first (TDD). Then write `test_isolation.py` and `test_inline_specs.py` against the actual files.
- **DevOps:** containerize with a lean `Dockerfile` (python:3.11-slim + tesseract-ocr) and a `docker-compose.yml` so the demo runs anywhere. Don't bake secrets.

## 7. Time/scope guardrails
- 1–2 days of agent time. If a piece is taking longer than 3 hours of wall time, drop to the simpler fallback (e.g., skip reranker, skip multilingual) and document the cut in README.
- DO NOT add a frontend. CLI + API only (per brief: "A notebook, REPL or simple script is sufficient").
- DO NOT introduce LangChain / LangGraph unless absolutely necessary — the orchestration here is small enough that explicit Python is clearer (and easier to defend in interview).

## 8. Deliverables for Marwan
1. The full repo at `/host/ai-company/pwc-rag-task/app/` ready to demo.
2. A `RUN_LOG.md` at the repo root: the 5 queries × actual outputs from `make demo`, copy-pasted.
3. A `LEARNING_NOTES.md` at the repo root: architecture-level talking points the candidate (Marwan) should be ready to defend in the live discussion (router design, why DuckDB, why per-client collections, isolation under SQL injection, what's missing for production).
4. A short `VIDEO_OUTLINE.md` matching the 10-min walkthrough required by the brief (intro 30s → ingestion 90s → stores 60s → router 90s → 5 queries 4min → architecture 90s → wrap 30s).

## 9. Out of scope
- Authentication. Production note in README is enough.
- A real frontend.
- Persistent multi-tenant database. DuckDB file is fine.
- Multi-user concurrency. Single-process is fine.

---
End of spec. If you find a contradiction with the PDF, **the PDF wins** — flag it in a comment on this issue.
