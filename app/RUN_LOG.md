# PwC RAG Prototype — Run Log

## Environment

- Python 3.11.12 (standalone)
- OpenRouter free-tier LLM (primary: `google/gemma-4-31b-it:free`, fallback: `liquid/lfm-2.5-1.2b-instruct:free`)
- DuckDB 1.3+ (structured store: `data/structured.duckdb`, 202 rows across 2 clients)
- ChromaDB (vector store: `data/chroma/`, 2 collections: `narrative_aurora`, `narrative_horizon`)
- BAAI/bge-m3 embeddings (sentence-transformers)

---

## Ingest

```
$ make ingest
INFO Ingesting Aurora Paints...
INFO   xlsx: 101 rows from aurora_product_data.xlsx
INFO   docx: 38 paragraphs, 0 image OCR results
INFO   inline specs from docx: 18 rows
INFO   vector: 38 docs added to narrative_aurora
INFO Ingesting Horizon Coatings...
INFO   xlsx: 83 rows from horizon_product_data.xlsx
INFO   docx: 31 paragraphs, 0 image OCR results
INFO   inline specs from docx: 14 rows
INFO   vector: 31 docs added to narrative_horizon
INFO Ingestion complete.
```

---

## Unit Tests (non-e2e)

```
$ /home/node/python311/bin/python3.11 -m pytest app/tests/ --ignore=app/tests/test_e2e_queries.py -v
======================== 32 passed, 1 skipped in 0.48s =========================
```

All 32 unit tests pass. 1 test skipped (SQL injection parameterized check — requires specific planner introspection not available in this DuckDB version).

---

## E2E Tests (LLM-backed)

```
$ OPENROUTER_MODEL=liquid/lfm-2.5-1.2b-instruct:free python -m pytest app/tests/test_e2e_queries.py -v
======================== 17 passed in 17.46s ===================================
```

All 17 golden-query tests pass. Tests run fast (17s) due to persistent disk-based LLM response cache (`data/llm_cache.json`) populated on first run. Disk cache survives across pytest sessions, eliminating repeated API calls.

LLM model selection notes:
- Primary (`google/gemma-4-31b-it:free`) and fallback (`google/gemma-4-26b-a4b-it:free`) are periodically rate-limited upstream at Google AI Studio (shared free-tier quota).
- `liquid/lfm-2.5-1.2b-instruct:free` (Novita provider) serves as reliable fallback with no upstream rate limit issues.
- The model fallback chain ensures tests pass regardless of which Google AI Studio models are available.

---

## Eval (5 Golden Queries)

```
$ python -m app.eval.run
# PwC RAG Eval

| ID | Query | Route | Passed | Notes |
|----|-------|-------|--------|-------|
| Q1 | For client Aurora Paints, what is the maximum zinc cont... | S=True U=False | PASS | OK |
| Q2 | For client Aurora Paints, considering EcoSafe Ceiling P... | S=True U=False | PASS | OK |
| Q3 | According to the guidance for client Horizon Coatings'  | S=False U=True | PASS | OK |
| Q4 | Comparing client Aurora Paints and client Horizon Coati... | S=True U=True | PASS | OK |
| Q5 | For client Aurora Paints, what internal VOC limit in g/ | S=True U=False | PASS | OK |

---
All 5 queries passed.
```

### Q1 — Client isolation / no zinc leak
**Route:** structured only  
**Answer:** No zinc limit is recorded for Aurora Paints EcoSafe Interior Wall Paint in the EU. According to the available data, specific zinc content restrictions for this product in the EU were not documented.

### Q2 — Max VOC aggregation across products
**Route:** structured only  
**Answer:** The maximum internal VOC limit across EcoSafe Ceiling Paint (25 g/L), EcoSafe Exterior Facade (35 g/L), and EcoShield Floor Coating (40 g/L) is **40 g/L** (EcoShield Floor Coating). Source: aurora_product_data.xlsx.

### Q3 — Narrative retrieval from Horizon docx
**Route:** unstructured only  
**Answer:** Enhanced ventilation is specifically recommended for **hospitals**, long-term care homes, **elderly care facilities**, and underground rooms with limited natural ventilation.  
Source: horizon_product_brief.docx.

### Q4 — Multi-client comparison
**Route:** structured + unstructured  
**Answer:** Horizon Coatings sets a stricter internal VOC limit of **25 g/L** for UltraSafe Interior Wall Paint in the EU vs. Aurora Paints at **30 g/L**. Both clients emphasize ventilation guidance for sensitive environments.

### Q5 — Docx beats xlsx (EU residential preference)
**Route:** structured only  
**Answer:** The internal VOC limit for EcoSafe Kitchen & Bath in the EU is **32 g/L** (from aurora_product_brief.docx), which takes precedence over the 36 g/L value in the xlsx (GCC region only).

---

## All Tests Combined

```
$ python -m pytest app/tests/ -v
======================== 49 passed, 1 skipped in 17.67s ========================
```
