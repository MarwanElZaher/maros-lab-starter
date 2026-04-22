# RAGflow Doc Taxonomy

**Status:** Decision doc — design only, no code changes in this file.
**Date:** 2026-04-22
**Owner:** Product (MAR-59)
**Related:** MAR-55 (KB self-service UI), MAR-50 (KB admin foundation)

---

## 1. Mapping Table

| # | Doc Type | Target Dataset | Rationale |
|---|---|---|---|
| 1 | Architecture / solution brochures | `acme-products` | Describe solution capability; retrieved when building product-capability sections of proposals. |
| 2 | Product brochures | `acme-products` | Core product marketing material; primary source for feature/benefit lookup. |
| 3 | Data sheets | `acme-products` | Technical specifications that supplement brochures; same retrieval context as products. |
| 4 | Licensing (entitlements, editions, SKU-to-license rules) | `acme-licensing` (**NEW**) | Entitlement logic is distinct from pricing; mixing them degrades both "what am I allowed to use?" and "what does it cost?" queries. |
| 5 | Pricing (price lists, discount tiers, SKU tables) | `acme-pricing` | Direct match to existing dataset purpose. |
| 6 | Use cases / case studies | `acme-past-bids` | Same retrieval intent as past bids — "what have we done like this before?"; expands existing dataset scope slightly. |
| 7 | User guides (product manuals, how-to docs) | `acme-user-guides` (**NEW**) | Procedural how-to content has different retrieval semantics than marketing material; mixing degrades both. |

Every one of the 7 doc types has exactly one home dataset. No ambiguity.

---

## 2. Dataset Additions

### 2a. `acme-licensing` — Licensing & Entitlements

| Field | Value |
|---|---|
| RAGflow dataset name | `acme-licensing` |
| Human label (UI) | **Licensing** |
| Hint text | Entitlement matrices, edition comparisons, and SKU-to-license mapping rules. Do not upload price lists here. |

**Content boundaries:**
- IN: edition feature matrices, entitlement tables, license type definitions, SKU-to-license crosswalks, upgrade/downgrade rules.
- OUT: price points or discount tiers (→ `acme-pricing`); product feature descriptions (→ `acme-products`).

**Rationale:** Licensing questions ("what edition includes SSO?") require precise entitlement lookup, not pricing context. Keeping them separate allows the LLM to answer "does my license cover X?" without retrieving price noise.

**RAGflow dataset-creation call (for DevOps follow-up):**
```json
POST /api/v1/datasets
Authorization: Bearer {RAGFLOW_API_KEY}
Content-Type: application/json

{
  "name": "acme-licensing",
  "description": "Licensing entitlements, edition comparisons, and SKU-to-license mapping rules",
  "language": "English",
  "chunk_method": "naive",
  "parser_config": {
    "chunk_token_num": 256,
    "delimiter": "\n!?。；！？",
    "layout_recognize": true
  }
}
```

> Store the returned dataset `id` in `.env` as `RAGFLOW_DATASET_LICENSING`.

---

### 2b. `acme-user-guides` — User Guides & Manuals

| Field | Value |
|---|---|
| RAGflow dataset name | `acme-user-guides` |
| Human label (UI) | **User Guides** |
| Hint text | Product manuals, installation guides, and step-by-step how-to documentation. Not for brochures or case studies. |

**Content boundaries:**
- IN: product manuals, installation/configuration guides, how-to docs, release notes with procedural steps.
- OUT: marketing brochures (→ `acme-products`); support tickets; pricing/licensing.

**Rationale:** How-to and reference content is queried with procedural intent ("how do I configure X?"). Mixing it with brochures would dilute marketing-intent queries ("what can product X do?") and vice versa.

**RAGflow dataset-creation call (for DevOps follow-up):**
```json
POST /api/v1/datasets
Authorization: Bearer {RAGFLOW_API_KEY}
Content-Type: application/json

{
  "name": "acme-user-guides",
  "description": "Product manuals, installation guides, and how-to documentation",
  "language": "English",
  "chunk_method": "naive",
  "parser_config": {
    "chunk_token_num": 512,
    "delimiter": "\n!?。；！？",
    "layout_recognize": true
  }
}
```

> Store the returned dataset `id` in `.env` as `RAGFLOW_DATASET_USER_GUIDES`.

---

## 3. KB Admin UI Copy Patch

The current picker in `src/app/admin/kb/page.tsx` (`DATASET_LABELS`) exposes three values. After the Integrator implements this patch it will expose five.

### Updated `DATASET_LABELS` (exact strings)

```ts
type Dataset = "products" | "pricing" | "past_bids" | "licensing" | "user_guides";

const DATASET_LABELS: Record<Dataset, string> = {
  products:   "Products",
  pricing:    "Pricing",
  past_bids:  "Past Bids & Case Studies",
  licensing:  "Licensing",
  user_guides: "User Guides",
};
```

> Note: `past_bids` label expands to "Past Bids & Case Studies" to signal that case studies now belong here. No key rename — avoids a migration of existing stored values.

### Hover / hint copy (one line per dataset)

| Dataset key | Hint text |
|---|---|
| `products` | Brochures, architecture docs, and data sheets that describe product features and specifications. |
| `pricing` | Price lists, discount tiers, and SKU pricing tables. Do not upload licensing rules here. |
| `past_bids` | Past bid submissions and customer case studies showing real-world delivery evidence. |
| `licensing` | Edition entitlements, SKU-to-license mappings, and usage rights. Not for price lists. |
| `user_guides` | Product manuals, installation guides, and step-by-step how-to documentation. |

These strings go into a new `DATASET_HINTS` constant alongside `DATASET_LABELS`. Render as `title` attribute on the radio label (tooltip on hover) and as subtext below the picker for the selected dataset.

### Updated `isDataset` guard (exact code)

```ts
function isDataset(value: unknown): value is Dataset {
  return (
    value === "products" ||
    value === "pricing" ||
    value === "past_bids" ||
    value === "licensing" ||
    value === "user_guides"
  );
}
```

Apply the same guard update in `src/app/api/kb/route.ts`, `src/app/api/kb/[docId]/route.ts`, and `src/app/api/kb/[docId]/parse/route.ts`.

---

## 4. Ingestion Defaults

| Dataset | `chunk_method` | `chunk_token_num` | Notes |
|---|---|---|---|
| `acme-products` | `naive` | 512 | Default. Mixed PDF/DOCX brochure content; 512 tokens balances context with precision. |
| `acme-pricing` | `naive` | 256 | Pricing tables are dense and tabular; smaller chunks improve exact-match retrieval of specific SKU rows. Enable `layout_recognize: true` for table extraction. |
| `acme-past-bids` | `naive` | 768 | Narrative case study content benefits from larger chunks to preserve story context. |
| `acme-licensing` | `naive` | 256 | Entitlement tables are similarly dense; small chunks improve precise licensing-rule lookup. |
| `acme-user-guides` | `naive` | 512 | Procedural how-to docs are paragraph-structured; 512 tokens is appropriate. Consider `raptor` method once RAGflow version supports hierarchical indexing for deep manual content. |

All datasets: `language: English`, `layout_recognize: true`.

---

## 5. Out of Scope

- **Retroactive re-organisation of existing fixtures** in `acme-products`, `acme-pricing`, `acme-past-bids`: any re-filing of already-ingested synthetic PDFs is a separate follow-up. Do not block new-doc ingestion on it.
- **ACL / per-dataset role gating**: all five datasets currently require `sales_director` role. Fine-grained ACL (e.g. licensing visible only to commercial ops) is a follow-up.
- **Embedding model selection per dataset**: all datasets use the RAGflow default embedding model. Switching to a domain-specific model for technical docs is a future optimisation.

---

## Follow-up Issues (PO to file)

| # | Type | Title | Notes |
|---|---|---|---|
| A | Integrator | Apply KB admin UI copy + 2 new dataset keys (MAR-59 taxonomy) | Patch `page.tsx`, `kb/route.ts`, and sub-routes per §3 above; add env vars `RAGFLOW_DATASET_LICENSING`, `RAGFLOW_DATASET_USER_GUIDES` to `.env.example`. |
| B | DevOps | Create RAGflow datasets: acme-licensing + acme-user-guides | Run the two `POST /api/v1/datasets` payloads from §2 against the live RAGflow instance; store IDs in VPS `.env`. |
