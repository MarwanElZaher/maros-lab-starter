# Video Outline — 10-Minute Walkthrough

## 0:00–0:30 — Introduction (30s)
- "This is a multi-source RAG prototype for PwC's take-home exercise."
- Two clients: Aurora Paints and Horizon Coatings
- 4 source files: 2 xlsx (structured specs) + 2 docx (narrative + inline specs)
- Stack: Python 3.11, FastAPI, DuckDB, ChromaDB, BAAI/bge-m3, OpenRouter

## 0:30–2:00 — Ingestion (90s)
- `make ingest` — show the terminal output
- Explain: xlsx → DuckDB with unified schema + column mapping
- Explain: docx → paragraphs into ChromaDB (per-client collections)
- Key point: regex inline spec extraction from docx → also goes into DuckDB
- Show `data/structured.duckdb` exists, `data/chroma/` directories
- Show `app/ingest/schemas.py` — Aurora vs Horizon column maps

## 2:00–3:00 — Stores (60s)
- Show DuckDB query: `SELECT * FROM specs WHERE client = 'Aurora Paints' LIMIT 5`
- Key: parameterised `WHERE client = ?` — not f-string (SQL injection safety)
- Show ChromaDB: `narrative_aurora` vs `narrative_horizon` — physical isolation
- Not a metadata filter — separate collections

## 3:00–4:30 — Router (90s)
- `app/retrieval/router.py` — hybrid approach
- Rule prefilter: numbers/VOC/limits → structured; guidance/ventilation → unstructured
- Both stores for comparison queries
- Show Q1 route: structured only (zinc limit query → no unstructured needed)
- Show Q3 route: unstructured only (guidance/ventilation → docx only)
- Show Q4 route: both stores, both clients (comparison)

## 4:30–8:30 — 5 Golden Queries (4 minutes)
- `make demo` — show all 5 queries running
- **Q1 (0:30)**: Aurora zinc query → "No zinc limit is recorded for Aurora Paints" — no "0.02", no "Horizon"
- **Q2 (0:30)**: Max VOC across Aurora products → 40 g/L EcoShield Floor Coating EU
- **Q3 (1:00)**: Horizon ventilation guidance → hospitals, elderly care, underground rooms
- **Q4 (1:00)**: Comparison Aurora vs Horizon VOC → Horizon stricter (25 g/L vs 30 g/L)
- **Q5 (1:00)**: Kitchen & Bath EU residential → 32 g/L from docx, not 36 g/L from xlsx (GCC illustrative)
  - Explain: docx source wins because it's specific to EU/residential

## 8:30–10:00 — Architecture & Close (90s)
- Show mermaid diagram from `ARCHITECTURE.md`
- Key points:
  - Physical client isolation (two collections, parameterised SQL)
  - Q4 two independent retrievals merged at compose time
  - Inline spec extraction from docx → structured store
  - Production gaps: Redis sessions, paid LLM, JWT auth
- "Thank you — questions welcome."
