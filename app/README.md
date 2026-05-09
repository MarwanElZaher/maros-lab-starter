# PwC RAG Prototype

Multi-source RAG prototype for PwC Senior AI Engineer take-home exercise.

## Quick Start

```bash
make setup
make ingest
make test
make eval
make serve   # API at http://localhost:8088
make demo    # 5 golden queries via CLI
```

## Architecture

```
Sources (xlsx + docx)
       ↓
  Ingestion Pipeline
  ├── Excel → DuckDB specs table (unified schema)
  ├── DOCX → ChromaDB vector store (per-client collection)
  ├── Inline spec extraction (regex) → DuckDB
  └── Image OCR (pytesseract) → ChromaDB [bonus]
       ↓
  Query Router (hybrid rule + LLM)
  ├── Rule prefilter: numbers/units → structured; guidance/ventilation → unstructured
  └── LLM second pass: JSON schema decision
       ↓
  Retrieval (per-client isolation)
  ├── Structured: parameterised DuckDB SQL (client = ?)
  └── Unstructured: ChromaDB collection per client
       ↓
  Answer Composition (OpenRouter LLM)
  └── Cited answer with route decision + sources
```

## Design Decisions

### Why DuckDB?
DuckDB handles analytical aggregations (`MAX(value) ACROSS products`) in a single query and ships as a single file. No server process needed, and it supports parameterised binding to prevent SQL injection.

### Why per-client ChromaDB collections?
Physical isolation (not metadata filter) prevents any code path from accidentally returning cross-client results. Even a bug in the retrieval layer cannot leak Aurora data into a Horizon response.

### Router design
A hybrid approach: fast rule-based prefilter handles unambiguous cases (numeric values → structured; guidance/ventilation language → unstructured), while an optional LLM second pass handles ambiguity. This makes the common cases deterministic and cheap while staying accurate on edge cases.

### Client isolation strategy
- DuckDB: `WHERE client = ?` (parameterised, never f-string)
- ChromaDB: separate collections `narrative_aurora`, `narrative_horizon`
- Retrieval layer enforces `client: str` as required argument
- Q4 comparison: two independent retrievals, merged at compose time

### Inline spec extraction
Regex pattern: numeric value + unit + parameter keyword (VOC, lead, zinc, etc.). Extracted specs are stored in the structured DuckDB store with `source_locator=docx_para=N`.

## What Would Change for Production

1. **Session storage**: Replace in-process dict with Redis (TTL, horizontal scaling)
2. **LLM**: Move to a paid OpenRouter model with guaranteed SLA
3. **Embeddings**: Cache model weights in a volume or model server
4. **Auth**: JWT middleware — client identity from session, not query parameter
5. **Reranker**: Add `BAAI/bge-reranker-v2-m3` cross-encoder for top-20 → top-5
6. **DuckDB**: For multi-user write workloads, migrate to PostgreSQL with pgvector

## Stack

- **Python 3.11**, FastAPI, uvicorn
- **DuckDB** (structured specs), **ChromaDB** (narrative vectors)
- **BAAI/bge-m3** embeddings (multilingual, CPU)
- **OpenRouter** LLM (free tier, `google/gemma-4-31b-it:free`)
- No LangChain, no frontend
