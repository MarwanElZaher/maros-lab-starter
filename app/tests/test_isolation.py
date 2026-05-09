"""
Client isolation tests.

Verifies:
1. Cross-client leak: Q1 (Aurora zinc) → response must NOT contain Horizon's zinc
   value "0.02", or the strings "Horizon" or "UltraSafe".
2. SQL injection safety: parameterised DuckDB binding rejects a hostile client name
   without crashing or leaking data.

These tests may stub the retrieval layer at module level when the app is not yet
fully implemented — import errors from the application must be caught cleanly.
"""
from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# Lazy import helpers — let tests fail with SKIP rather than hard ImportError
# ---------------------------------------------------------------------------

def _import_retrieval():
    """Return the structured retrieval module or skip the test."""
    try:
        from app.retrieval import structured as ret  # type: ignore[import]
        return ret
    except ImportError:
        pytest.skip("app.retrieval.structured not yet implemented")


def _import_structured_store():
    """Return the DuckDB store module or skip the test."""
    try:
        from app.stores import structured as store  # type: ignore[import]
        return store
    except ImportError:
        pytest.skip("app.stores.structured not yet implemented")


# ---------------------------------------------------------------------------
# Fixture: in-memory DuckDB with a tiny specs table for injection tests
# ---------------------------------------------------------------------------

@pytest.fixture()
def in_memory_store():
    """Spin up an isolated in-memory DuckDB store populated with fake rows."""
    store_mod = _import_structured_store()
    try:
        store = store_mod.StructuredStore(":memory:")
    except Exception:
        pytest.skip("StructuredStore cannot be instantiated with ':memory:'")
    store.initialize_schema()
    store.insert_rows([
        {
            "client": "Aurora Paints",
            "product": "EcoSafe Interior Wall Paint",
            "region": "EU",
            "parameter": "max_voc_content",
            "value": 30.0,
            "unit": "g/L",
            "limit_type": "internal_limit",
            "notes": "EU residential",
            "source_file": "aurora_product_data.xlsx",
            "source_locator": "row=2",
        },
        {
            "client": "Horizon Coatings",
            "product": "UltraSafe Interior Wall Paint",
            "region": "EU",
            "parameter": "max_zinc_content",
            "value": 0.02,
            "unit": "%",
            "limit_type": "internal_limit",
            "notes": "",
            "source_file": "horizon_product_data.xlsx",
            "source_locator": "row=5",
        },
    ])
    return store


# ---------------------------------------------------------------------------
# Test 1: cross-client leak — Aurora zinc query must not surface Horizon data
# ---------------------------------------------------------------------------

class TestCrossClientLeak:
    """Q1 scenario: Aurora has no zinc data; Horizon does. Must not leak."""

    HOSTILE_STRINGS = ["0.02", "Horizon", "UltraSafe"]

    def _run_zinc_query(self, store) -> list[dict]:
        """Ask for Aurora zinc via the store's query interface."""
        store_mod = _import_structured_store()
        return store.query(
            client="Aurora Paints",
            parameter="max_zinc_content",
            region="EU",
        )

    def test_no_zinc_rows_for_aurora(self, in_memory_store):
        """Store must return zero rows for Aurora zinc — not Horizon's."""
        rows = self._run_zinc_query(in_memory_store)
        assert rows == [], (
            f"Expected no zinc rows for Aurora Paints but got: {rows}"
        )

    def test_aurora_zinc_answer_does_not_contain_horizon_value(self, in_memory_store):
        """
        Even if a higher-level answer-composition step formats the response,
        the raw retrieved rows for Aurora zinc must not reference Horizon data.
        """
        rows = self._run_zinc_query(in_memory_store)
        combined = " ".join(str(r) for r in rows)
        for banned in self.HOSTILE_STRINGS:
            assert banned.lower() not in combined.lower(), (
                f"Aurora zinc query result leaked banned string {banned!r}. "
                f"Raw rows: {rows}"
            )

    def test_isolation_by_client_filter(self, in_memory_store):
        """Store must scope results to the requested client only."""
        aurora_rows = in_memory_store.query(client="Aurora Paints")
        for row in aurora_rows:
            client_val = row.get("client", "")
            assert client_val == "Aurora Paints", (
                f"Expected only Aurora rows but got client={client_val!r}"
            )


# ---------------------------------------------------------------------------
# Test 2: SQL injection — parameterised binding must reject hostile input
# ---------------------------------------------------------------------------

class TestSQLInjection:
    """
    DuckDB queries must use parameterised binding.
    A client name containing SQL injection payload must not crash or leak data.
    """

    INJECTION_PAYLOADS = [
        "Aurora Paints'; --",
        "Aurora Paints' OR '1'='1",
        "'; DROP TABLE specs; --",
        "Aurora Paints\"; --",
    ]

    def test_injection_payload_returns_empty_not_crash(self, in_memory_store):
        """
        Passing a hostile client name must not raise an exception and must
        return an empty result set (because no row has that exact client name).
        """
        for payload in self.INJECTION_PAYLOADS:
            try:
                rows = in_memory_store.query(client=payload)
            except Exception as exc:
                pytest.fail(
                    f"Store raised {type(exc).__name__} for payload {payload!r}: {exc}"
                )
            assert isinstance(rows, list), (
                f"Expected list result for payload {payload!r}, got {type(rows)}"
            )
            assert rows == [], (
                f"Expected empty rows for injection payload {payload!r}, got {rows}"
            )

    def test_store_still_works_after_injection_attempt(self, in_memory_store):
        """
        After a series of hostile queries the store must still return correct
        legitimate results — the table must not have been dropped.
        """
        for payload in self.INJECTION_PAYLOADS:
            try:
                in_memory_store.query(client=payload)
            except Exception:
                pass  # will be caught by the previous test

        aurora_rows = in_memory_store.query(client="Aurora Paints")
        assert len(aurora_rows) >= 1, (
            "Legitimate Aurora query returned no rows after injection attempts "
            "— the specs table may have been corrupted."
        )

    def test_retrieval_layer_uses_parameterised_binding(self):
        """
        Smoke-test that the retrieval module's SQL-building helper does not
        interpolate client names via f-string.
        """
        ret_mod = _import_retrieval()
        build_fn = getattr(ret_mod, "build_client_filter_query", None)
        if build_fn is None:
            pytest.skip("build_client_filter_query not found in retrieval.structured")
        sql, params = build_fn(
            client="Aurora Paints'; --",
            parameter="max_voc_content",
            region="EU",
        )
        assert "Aurora Paints'; --" not in sql, (
            "Client name was interpolated directly into SQL string — use parameterised binding."
        )
        assert len(params) >= 1, "Expected at least one bound parameter"
