"""Tests for Excel ingestion and schema mapping."""
import pytest
from pathlib import Path

SOURCES = Path("/host/ai-company/pwc-rag-task/sources")


def test_aurora_xlsx_loads():
    from app.ingest.excel import load_xlsx
    rows = load_xlsx(SOURCES / "aurora_product_data.xlsx", "aurora")
    assert len(rows) > 0, "Aurora xlsx should have rows"
    for r in rows:
        assert r.client == "Aurora Paints"
        assert r.product
        assert r.parameter


def test_horizon_xlsx_loads():
    from app.ingest.excel import load_xlsx
    rows = load_xlsx(SOURCES / "horizon_product_data.xlsx", "horizon")
    assert len(rows) > 0, "Horizon xlsx should have rows"
    for r in rows:
        assert r.client == "Horizon Coatings"
        assert r.product


def test_aurora_column_mapping():
    """Aurora columns: client_name, product_name, region, parameter, value, unit, limit_type, notes."""
    from app.ingest.schemas import AURORA_MAP, AURORA_CLIENT_NAME
    assert "client_name" in AURORA_MAP
    assert "product_name" in AURORA_MAP
    assert AURORA_MAP["client_name"] == "client"
    assert AURORA_MAP["product_name"] == "product"


def test_horizon_column_mapping():
    """Horizon columns: supplier_name, product_line, market, metric, metric_value, metric_unit, classification, remarks."""
    from app.ingest.schemas import HORIZON_MAP, HORIZON_CLIENT_NAME
    assert "supplier_name" in HORIZON_MAP
    assert "product_line" in HORIZON_MAP
    assert HORIZON_MAP["supplier_name"] == "client"
    assert HORIZON_MAP["product_line"] == "product"
    assert HORIZON_MAP["metric_value"] == "value"
