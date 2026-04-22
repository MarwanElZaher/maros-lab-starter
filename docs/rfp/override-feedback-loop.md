# Pre-bid NO-GO Override + Feedback Loop

**Spec owner:** Product Owner  
**Issued:** 2026-04-22  
**Extends:** [MAR-44](/MAR/issues/MAR-44) (post-bid outcome writeback)  
**Issue:** [MAR-64](/MAR/issues/MAR-64)

---

## Problem Statement

The RFP analyzer returns NO-GO on an RFP, but the team decides to bid on a scoped portion anyway (e.g. "we cannot deliver modules A & B but we will bid on C & D"). There is currently no way to record that decision. The next similar RFP receives the same blanket NO-GO, ignoring the precedent set by the team's earlier override.

This spec adds a **pre-bid override layer** on top of the post-bid outcome flow already defined in MAR-44. Together they form the complete learning-loop feedback cycle: override decision → outcome → writeback to past-bids KB → influences future analyses.

---

## Acceptance Criteria

1. A `sales_director`-role user viewing an analysis with `NO-GO` or `CONDITIONAL-GO` verdict sees an "Override analyzer decision" button.
2. Submitting the override persists `override_decision`, `override_scope`, `override_rationale`, `override_by_user_email`, and `override_at` to the `analyses` table.
3. A markdown document in the `past-bids` RAGflow dataset (`aca85a8a3bfb11f18e37b14efee78710`) is created (or updated) within 30 s of saving an override **or** an outcome.
4. The `retrieve_similar_bids` LangGraph node surfaces those docs as candidates for the synthesis prompt.
5. The synthesis prompt explicitly cites human-override precedents when recommending a scoped bid.
6. Every override writes an audit event `rfp.override`.
7. Only `sales_director` role can call `POST /api/rfp/:id/override`.
8. `override_scope` is required when `override_decision = go_scoped`; `override_rationale` is required for any non-`none` override; the API returns `422` otherwise.

---

## 1. Data Model Extension

Extend the `analyses` table (introduced in slice 3) with the following columns.

```sql
ALTER TABLE analyses
  ADD COLUMN override_decision       TEXT NOT NULL DEFAULT 'none'
                                     CHECK (override_decision IN ('none','go_full','go_scoped','no_go_confirmed')),
  ADD COLUMN override_scope          TEXT,         -- required when override_decision = 'go_scoped'
  ADD COLUMN override_rationale      TEXT,         -- required for any non-'none' override
  ADD COLUMN override_by_user_email  TEXT,
  ADD COLUMN override_at             TIMESTAMPTZ,
  ADD COLUMN cited_analysis_ids      TEXT[];       -- optional: past analysis IDs cited as precedent

-- Constraint: scope required when scoped
ALTER TABLE analyses
  ADD CONSTRAINT chk_go_scoped_requires_scope
    CHECK (override_decision <> 'go_scoped' OR (override_scope IS NOT NULL AND trim(override_scope) <> ''));

-- Constraint: rationale required for any override
ALTER TABLE analyses
  ADD CONSTRAINT chk_override_requires_rationale
    CHECK (override_decision = 'none' OR (override_rationale IS NOT NULL AND trim(override_rationale) <> ''));
```

**Enum semantics:**

| Value | Meaning |
|---|---|
| `none` | No override — team accepts analyzer recommendation |
| `go_full` | Team bids full-scope despite NO-GO/CONDITIONAL-GO |
| `go_scoped` | Team bids a defined sub-scope; `override_scope` documents what is included/excluded |
| `no_go_confirmed` | Team explicitly confirms the NO-GO (records the deliberation) |

---

## 2. API Route

```
POST /api/rfp/:id/override
Authorization: Bearer <jwt>   (must have sales_director role)

Body:
{
  "override_decision":  "go_scoped",          // required
  "override_scope":     "Bid modules C & D only; exclude A (capacity) and B (out of domain)",
  "override_rationale": "Client is a key reference; partial delivery still builds relationship",
  "cited_analysis_ids": ["<analysis-uuid-1>"] // optional
}

Responses:
  200  { analysis: <updated row> }
  403  user does not have sales_director role
  404  analysis not found
  409  analysis already has a non-'none' override
  422  validation failure (missing required fields)
```

An audit event `rfp.override` is written synchronously before the 200 response is returned.

The route **triggers** the RAGflow writeback job (see §3) as a background task.

---

## 3. RAGflow Writeback

Both the override-save path and the outcome-save path (MAR-44) converge on the same writeback function.

### Markdown Document Schema

```markdown
# {client} — {rfp_title} — {decision_final}

**Analysis ID:** {analysis_id}
**RFP Date:** {rfp_date}

## Analyzer Verdict
- Decision: {analyzer_decision} (confidence {confidence}%)
- Key blockers:
{key_blockers_list}

## Human Override
- Final decision: {override_decision}
- Scope (if scoped):
{override_scope}
- Rationale: {override_rationale}
- Override by: {override_by_user_email} at {override_at}
- Cited precedents: {cited_analysis_ids_as_links}

## Outcome (post-bid)
- Result: {outcome}  <!-- won | lost | withdrawn | declined | pending -->
- Rationale: {outcome_rationale}
- Recorded at: {outcome_at}
```

`decision_final` (used in the document title) is derived as:

- If `outcome` is set → `outcome` value
- Else if `override_decision ≠ none` → `override_decision`
- Else → `analyzer_decision`

### Upload Flow

1. Render the markdown document from the analysis row.
2. `POST /api/v1/document/upload` to RAGflow dataset `aca85a8a3bfb11f18e37b14efee78710`, filename `{analysis_id}.md`.
3. Poll `GET /api/v1/document/{doc_id}` until `run_status = DONE` (timeout 60 s).
4. On success, set `persisted_to_ragflow = true` and `ragflow_doc_id` on the analyses row.
5. On failure, log error, leave `persisted_to_ragflow = false` for retry.

If a document for the same `analysis_id` already exists in RAGflow, **delete** the old document before uploading the new one (idempotent re-sync on outcome update).

---

## 4. Retrieval Effect (LangGraph)

### `retrieve_similar_bids` Node Update

No change to the RAGflow query call. The enriched markdown documents will naturally surface when relevant RFP text matches.

### Synthesis Prompt Update

Add a section in the analyzer synthesis prompt (LangGraph `synthesize_analysis` node):

```
If any similar bids in the context show a human override (go_scoped or go_full despite a NO-GO
analyzer verdict), the final recommendation MUST include a "Precedent" subsection that:
- Lists the cited past-bid document(s) and their override rationale.
- Explicitly asks: "Could a scoped bid approach work here as it did in [cited case]?"
- Adjusts the confidence modifier: a NO-GO backed by a relevant go_scoped precedent should
  be downgraded to CONDITIONAL-GO unless there is a strong differentiating reason.
```

---

## 5. UI — Override Modal

**Trigger:** "Override analyzer decision" button, visible only when:
- Current user has `sales_director` role.
- Analysis `override_decision = 'none'` (not yet overridden).
- `analyzer_decision` is `NO-GO` or `CONDITIONAL-GO`.

**Modal fields:**

| Field | Type | Required | Shown when |
|---|---|---|---|
| Final decision | Radio (Confirm analyzer / Go full-scope / Go scoped / Confirm NO-GO) | Always | Always |
| Scope description | Textarea | Yes | `go_scoped` selected |
| Rationale | Textarea | Yes | Any non-confirm selection |
| Cite similar bid | Multi-select (past analyses) | No | Always |

**Submit** → `POST /api/rfp/:id/override`.

On success, the analysis card updates to show:
- Override badge (colour-coded by decision type).
- Scope and rationale in a collapsible section.
- "Override recorded" toast.

Existing `go_scoped`/`go_full`/`no_go_confirmed` overrides are **read-only** — the button is replaced with an "Edit override" link that opens a support request (v1 simplification; full edit flow is a follow-up).

---

## 6. Governance

| Rule | Detail |
|---|---|
| Role gate | Only `sales_director` may call `POST /api/rfp/:id/override` |
| Audit event | `rfp.override` written synchronously; fields: `analysis_id`, `user_email`, `override_decision`, `override_scope`, `override_rationale`, `cited_analysis_ids`, `timestamp` |
| Immutability | Overrides cannot be edited or deleted in v1 (append-only audit trail) |
| KPI (stretch) | Count of override-influenced analyses per month displayed on `/analyses` |

---

## 7. Implementation Slices (to be filed as subtasks of MAR-64)

| Slice | Title | Size |
|---|---|---|
| S1 | DB migration — add override columns + constraints | S |
| S2 | API route `POST /api/rfp/:id/override` + role gate + audit event | M |
| S3 | RAGflow writeback — unified writeback function (override + outcome paths) | M |
| S4 | UI — Override modal + analysis card badge | M |
| S5 | LangGraph — synthesis prompt update for precedent citation | S |
| S6 | `retrieve_similar_bids` integration test with override docs | S |

**Ship-first slice:** S1 (DB migration) — unblocks S2 and S3 in parallel.

---

## 8. Dependency Map

```
MAR-59 (doc taxonomy) ──┐
MAR-60 (LangGraph plan) ─┤──► MAR-64 writeback (S3, S5)
MAR-44 (post-bid flow)  ─┘
```

MAR-44 scope is updated to reference this spec. The unified writeback function (S3) supersedes the standalone writeback described in MAR-44; MAR-44 implementation tickets should use this spec as the source of truth for the document schema.

---

## Open Questions

1. Should a `go_scoped` override auto-set `bid_status` to `in_progress` or remain in the analyst's control?
2. Max number of `cited_analysis_ids` per override (suggest: 5)?
3. Should the `/analyses` KPI widget be part of this epic or a separate stretch ticket?
