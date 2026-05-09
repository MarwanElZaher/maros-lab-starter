"""Per-client column maps and the unified spec schema."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Unified schema (target shape)
# ---------------------------------------------------------------------------

UNIFIED_COLUMNS = [
    "client",
    "product",
    "region",
    "parameter",
    "value",
    "unit",
    "limit_type",
    "notes",
    "source_file",
    "source_locator",
    "ingested_at",
]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS specs (
    client          TEXT,
    product         TEXT,
    region          TEXT,
    parameter       TEXT,
    value           DOUBLE,
    unit            TEXT,
    limit_type      TEXT,
    notes           TEXT,
    source_file     TEXT,
    source_locator  TEXT,
    ingested_at     TIMESTAMP DEFAULT current_timestamp
)
"""


# ---------------------------------------------------------------------------
# Aurora column map
# Aurora xlsx columns: client_name, product_name, region, parameter,
#                      value, unit, limit_type, notes
# ---------------------------------------------------------------------------

AURORA_MAP: dict[str, str] = {
    "client_name": "client",
    "product_name": "product",
    "region": "region",
    "parameter": "parameter",
    "value": "value",
    "unit": "unit",
    "limit_type": "limit_type",
    "notes": "notes",
}

AURORA_CLIENT_NAME = "Aurora Paints"


# ---------------------------------------------------------------------------
# Horizon column map
# Horizon xlsx columns: supplier_name, product_line, market, metric,
#                       metric_value, metric_unit, classification, remarks
# ---------------------------------------------------------------------------

HORIZON_MAP: dict[str, str] = {
    "supplier_name": "client",
    "product_line": "product",
    "market": "region",
    "metric": "parameter",
    "metric_value": "value",
    "metric_unit": "unit",
    "classification": "limit_type",
    "remarks": "notes",
}

HORIZON_CLIENT_NAME = "Horizon Coatings"


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

CLIENT_CONFIGS: dict[str, dict] = {
    "aurora": {
        "name": AURORA_CLIENT_NAME,
        "column_map": AURORA_MAP,
        "xlsx": "aurora_product_data.xlsx",
        "docx": "aurora_product_brief.docx",
        "chroma_collection": "narrative_aurora",
    },
    "horizon": {
        "name": HORIZON_CLIENT_NAME,
        "column_map": HORIZON_MAP,
        "xlsx": "horizon_product_data.xlsx",
        "docx": "horizon_product_brief.docx",
        "chroma_collection": "narrative_horizon",
    },
}


@dataclass
class UnifiedRow:
    client: str
    product: str
    region: str
    parameter: str
    value: float | None
    unit: str
    limit_type: str
    notes: str
    source_file: str
    source_locator: str

    def as_tuple(self) -> tuple:
        return (
            self.client,
            self.product,
            self.region,
            self.parameter,
            self.value,
            self.unit,
            self.limit_type,
            self.notes,
            self.source_file,
            self.source_locator,
        )

    @classmethod
    def from_raw(
        cls,
        raw: dict[str, Any],
        column_map: dict[str, str],
        client_name: str,
        source_file: str,
        source_locator: str,
    ) -> "UnifiedRow":
        mapped: dict[str, Any] = {}
        for src_col, tgt_col in column_map.items():
            mapped[tgt_col] = raw.get(src_col) or raw.get(src_col.lower(), "")

        # Override client from config (xlsx might have variant spellings)
        mapped["client"] = client_name

        try:
            val = float(str(mapped.get("value", "")).strip())
        except (ValueError, TypeError):
            val = None

        return cls(
            client=mapped.get("client", client_name),
            product=str(mapped.get("product", "")),
            region=str(mapped.get("region", "")),
            parameter=str(mapped.get("parameter", "")),
            value=val,
            unit=str(mapped.get("unit", "")),
            limit_type=str(mapped.get("limit_type", "")),
            notes=str(mapped.get("notes", "")),
            source_file=source_file,
            source_locator=source_locator,
        )
