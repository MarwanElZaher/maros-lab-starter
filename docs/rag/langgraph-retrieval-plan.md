# LangGraph Retrieval Plan — Fan-out for Licensing / Use-Cases / User Guides

**Status:** Decision doc — spec only, no code changes in this file.
**Date:** 2026-04-22
**Owner:** Product ([MAR-60](/MAR/issues/MAR-60))
**Depends on:** [MAR-59](/MAR/issues/MAR-59) (doc taxonomy — datasets finalised)
**Implementation ticket:** to be filed by PO after this doc is merged

---

## Graph Baseline (as of this decision)

`services/rfp-analyzer/src/graph.ts` has five nodes:

```
extractRequirements
  → queryKnowledgeBases   (3-way parallel: products, pricing, past-bids)
    → detectBlockers
      → [conditional] retrieveSimilarBids   (if no critical blocker)
        → synthesiseRecommendation
```

State fields relevant to KB: `kbProducts`, `kbPricing`, `kbPastBids`.

Env vars: `RAGFLOW_DATASET_PRODUCTS`, `RAGFLOW_DATASET_PRICING`, `RAGFLOW_DATASET_PAST_BIDS`.

---

## Decision 1 — Fan-out Scope

**Decision: expand `queryKnowledgeBases` to a 4-way parallel fan-out by adding `kbLicensing`. No new dataset nodes for user guides or use cases.**

### `acme-licensing` → YES, add to fan-out

Licensing is a first-class presales signal. An RFP may require a feature that our product supports — but only in a higher edition than what the customer is licensed for. This is a blocker class that the current 3-dataset fan-out cannot detect (product brochures assert capability without edition constraints; pricing datasets assert cost without capability limits).

Add a fourth parallel branch in `queryKnowledgeBases`:

```ts
retrieveChunks(`Licensing and entitlements for: ${query}`, LICENSING_DATASET)
```

State key: `kbLicensing`. Env var: `RAGFLOW_DATASET_LICENSING`.

### `acme-past-bids` (use cases) → no change needed

Per [MAR-59](/MAR/issues/MAR-59) taxonomy, use cases / case studies map to `acme-past-bids`. The existing `retrieveSimilarBids` node already queries this dataset. No new `retrieve_use_cases` node is required — use-case docs ingest into `acme-past-bids` alongside past bids, and the existing `kbPastBids` retrieval query ("Bids similar to: …") will surface them naturally.

**Do NOT create a separate `retrieve_use_cases` node.**

### `acme-user-guides` → EXCLUDED from retrieval path

User guides answer "how do I configure X?" — a post-sales question. Including procedural how-to content in an RFP analysis retrieval path would inject irrelevant noise into product-capability and pricing queries and degrade the quality of blocker detection and recommendation synthesis. Excluded unconditionally.

**No new node or state field for user guides. `RAGFLOW_DATASET_USER_GUIDES` is never read by the graph.**

---

## Decision 2 — Retrieval Weighting (Authoritative Override)

**Decision: `kbLicensing` is authoritative over `kbProducts` for any feature-availability or edition-entitlement claim. Enforced by synthesis prompt; no architectural change.**

### Rationale

Product brochures describe capability ("supports SSO"). Licensing matrices constrain that capability by edition ("SSO: Enterprise only"). When the two conflict or the brochure is silent on edition constraints, the licensing doc is the ground truth.

### Synthesis Rule (verbatim prompt addition in `synthesiseRecommendation`)

```
IMPORTANT: If kbLicensing contains edition or entitlement constraints that narrow or
contradict a claim in kbProducts (e.g. "Feature X is available in Enterprise edition
only"), treat the licensing constraint as authoritative. Do not cite the product
brochure claim as evidence the RFP can be met if the licensing doc says otherwise.
```

This is a prompt-level change only. No new node, no new edge, no schema change required for Decision 2 alone.

---

## Decision 3 — Blocker Detection: New Entitlement-Mismatch Rule-Pack

**Decision: add an `entitlementMismatches` field to `BlockerAnalysisSchema` and update the `detectBlockers` node prompt to actively check for entitlement mismatches using `kbLicensing`.**

### New Blocker Class

**Entitlement mismatch**: the RFP requires feature X; `kbProducts` confirms X exists; but `kbLicensing` shows X is restricted to edition Y; the RFP context (budget, stated tier, or comparable bids) suggests the customer will not be on edition Y.

This is distinct from a capability gap (feature doesn't exist at all) and needs explicit detection.

### State Change

Pass `kbLicensing` into the `detectBlockers` node. It is already in state after the 4-way fan-out.

### Schema Change — `BlockerAnalysisSchema` (`services/rfp-analyzer/src/types.ts`)

Add a new optional field:

```ts
entitlementMismatches: z.array(z.object({
  feature: z.string(),
  requiredEdition: z.string(),
  customerEdition: z.string().nullable(), // null = unknown from RFP context
  severity: z.enum(['critical', 'high', 'medium', 'low']),
})).optional(),
```

Set `hasCriticalBlocker = true` when any `entitlementMismatches` entry has `severity: 'critical'`.

### Updated `detectBlockers` Prompt Addition

```
Also check for entitlement mismatches using the Licensing context below:
an entitlement mismatch is when the RFP requires a product feature, the product
brochure confirms it exists, but the licensing rules restrict it to a specific
edition or tier that the customer is unlikely to hold (based on budget or stated
scope). List each mismatch with the feature name, required edition, and estimated
customer edition (or null if unknown).

Licensing context:
{kbLicensing}
```

---

## Decision 4 — Use-Case Grounding

**Decision: use cases merge into `acme-past-bids`. No separate `retrieve_use_cases` node. `retrieveSimilarBids` unchanged.**

See Decision 1 for full rationale. The only required change is operational: instruct sales ops to ingest use-case / case-study PDFs into the `acme-past-bids` dataset (not a new dataset). The KB admin UI label "Past Bids & Case Studies" (per [MAR-59](/MAR/issues/MAR-59) §3) signals this to non-technical users.

---

## Decision 5 — User Guides Exclusion

**Decision: CONFIRMED EXCLUDED. No graph node, no env var read, no state field.**

Rationale in Decision 1. If a future use case requires user-guide retrieval (e.g. a "how-to-implement" proposal section), that is a separate product decision and a new graph branch outside this issue's scope.

---

## Implementation Plan (for FoundEng follow-up issue)

The following are the exact file changes FoundEng must make. No other files change.

### File 1: `services/rfp-analyzer/src/graph.ts`

**Change 1a — add env var constant (after line 17)**
```ts
const LICENSING_DATASET = process.env.RAGFLOW_DATASET_LICENSING ?? '';
```

**Change 1b — add `kbLicensing` to `GraphState` (after `kbPastBids` field)**
```ts
kbLicensing: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
```

**Change 1c — update `queryKnowledgeBases` to 4-way fan-out**

Replace the current `Promise.all` block:
```ts
const [kbProducts, kbPricing, kbPastBids, kbLicensing] = await Promise.all([
  retrieveChunks(`Products matching: ${query}`, PRODUCTS_DATASET),
  retrieveChunks(`Pricing and discounts for: ${query}`, PRICING_DATASET),
  retrieveChunks(`Similar past bids: ${query}`, PAST_BIDS_DATASET, 5),
  retrieveChunks(`Licensing and entitlements for: ${query}`, LICENSING_DATASET),
]);

return { kbProducts, kbPricing, kbPastBids, kbLicensing };
```

**Change 1d — update `detectBlockers` node**

- Add `state.kbLicensing` to the user message content.
- Add instruction to detect entitlement mismatches (see Decision 3 prompt above).
- The LLM call already uses `BlockerAnalysisSchema` via `withStructuredOutput` — updating the schema (below) is sufficient for structured output to include the new field.

**Change 1e — update `synthesiseRecommendation` node**

- Add `kbLicensing` to the content array passed to the LLM.
- Prepend the authoritative-override instruction from Decision 2.

Example content array entry to add:
```ts
`Licensing (AUTHORITATIVE over Products for edition/entitlement claims):\n${state.kbLicensing}`,
```

### File 2: `services/rfp-analyzer/src/types.ts`

**Change 2a — add `entitlementMismatches` to `BlockerAnalysisSchema`**

```ts
export const EntitlementMismatchSchema = z.object({
  feature: z.string(),
  requiredEdition: z.string(),
  customerEdition: z.string().nullable(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
});

export const BlockerAnalysisSchema = z.object({
  blockers: z.array(z.object({
    description: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.string(),
  })),
  entitlementMismatches: z.array(EntitlementMismatchSchema).optional(),
  hasCriticalBlocker: z.boolean(),
});

export type BlockerAnalysis = z.infer<typeof BlockerAnalysisSchema>;
```

**Change 2b — update `KbResults` interface**

```ts
export interface KbResults {
  products: string;
  pricing: string;
  pastBids: string;
  licensing: string;
}
```

### File 3: `.env.example`

Add one line after `RAGFLOW_DATASET_PAST_BIDS`:
```
RAGFLOW_DATASET_LICENSING=
```

Do NOT add `RAGFLOW_DATASET_USER_GUIDES` — user guides are excluded from the graph.

---

## Summary Table

| Doc type | Dataset | In retrieval graph? | State key | Change required? |
|---|---|---|---|---|
| Architecture / solution brochures | `acme-products` | YES | `kbProducts` | None |
| Product brochures | `acme-products` | YES | `kbProducts` | None |
| Data sheets | `acme-products` | YES | `kbProducts` | None |
| Licensing | `acme-licensing` | YES (**NEW**) | `kbLicensing` | Add 4th fan-out branch |
| Pricing | `acme-pricing` | YES | `kbPricing` | None |
| Use cases / case studies | `acme-past-bids` | YES (via `retrieveSimilarBids`) | `kbPastBids` | None (ingest guidance only) |
| User guides | `acme-user-guides` | **NO** | — | None |

---

## Follow-up Issues (PO to file)

| # | Type | Assignee | Title |
|---|---|---|---|
| A | FoundEng | Integrator/FoundEng | Implement LangGraph licensing fan-out (MAR-60 spec) — graph.ts + types.ts + .env.example |
