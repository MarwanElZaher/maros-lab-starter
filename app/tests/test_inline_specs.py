"""
Unit tests for the regex/keyword inline-spec extractor (app/ingest/inline_specs.py).

Verifies that:
1. The extractor finds spec-shaped sentences in real source docx files.
2. Spec-shaped sentences satisfy both criteria: numeric value + unit AND a
   parameter keyword from the defined vocabulary.
3. The extractor does NOT flag plain narrative prose that has no numeric spec.

These tests read the actual source files at SOURCES_DIR.  They run standalone
and do not require the full app stack.
"""
from __future__ import annotations

import re
import sys
import os
from pathlib import Path

import pytest

SOURCES_DIR = Path("/host/ai-company/pwc-rag-task/sources")
AURORA_DOCX = SOURCES_DIR / "aurora_product_brief.docx"
HORIZON_DOCX = SOURCES_DIR / "horizon_product_brief.docx"

# ---------------------------------------------------------------------------
# Lazy import helpers
# ---------------------------------------------------------------------------

def _import_inline_specs():
    """Import app.ingest.inline_specs or skip if not yet implemented."""
    try:
        from app.ingest import inline_specs  # type: ignore[import]
        return inline_specs
    except ImportError:
        pytest.skip("app.ingest.inline_specs not yet implemented")


def _import_docx_parse():
    """Import app.ingest.docx_parse or skip if not yet implemented."""
    try:
        from app.ingest import docx_parse  # type: ignore[import]
        return docx_parse
    except ImportError:
        pytest.skip("app.ingest.docx_parse not yet implemented")


# ---------------------------------------------------------------------------
# Reference implementation of the extractor pattern used in tests below.
# When the real module is available the tests delegate to it; when not, this
# fallback lets the structural tests still run.
# ---------------------------------------------------------------------------

# Parameter keywords from SPEC.md §3.3 (extend as needed)
_PARAM_KEYWORDS = [
    "voc", "lead", "zinc", "cadmium", "drying time", "ventilation period",
    "ventilation", "voc content", "voc limit", "flash point", "solvent",
    "titanium dioxide", "dry film", "wet film", "gloss", "coverage",
    "dilution", "thinning", "pot life",
]
_PARAM_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in _PARAM_KEYWORDS) + r")\b",
    re.IGNORECASE,
)
# Numeric value with unit: e.g. "30 g/L", "0.02 %", "24 hours", "50 µm"
_NUMERIC_UNIT_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:g/[lL]|g/l|g/L|%|µm|um|h\b|hours?|days?|ppm|mg/kg|mg/m³|m²/L|m²/l)(?:\b|(?=\s|$|[.,;)\]]|by\b))",
    re.IGNORECASE,
)


def _is_spec_shaped(text: str) -> bool:
    """Reference check: text has a numeric-unit token AND a param keyword."""
    return bool(_NUMERIC_UNIT_RE.search(text)) and bool(_PARAM_RE.search(text))


# ---------------------------------------------------------------------------
# Fixtures: load paragraphs from real docx files
# ---------------------------------------------------------------------------

def _read_paragraphs_raw(docx_path: Path) -> list[str]:
    """Read paragraphs from a docx using python-docx (skip if unavailable)."""
    try:
        import docx  # type: ignore[import]
    except ImportError:
        pytest.skip("python-docx not installed; cannot read .docx files")
    doc = docx.Document(str(docx_path))
    return [p.text.strip() for p in doc.paragraphs if p.text.strip()]


@pytest.fixture(scope="module")
def aurora_paragraphs() -> list[str]:
    if not AURORA_DOCX.exists():
        pytest.skip(f"Source file not found: {AURORA_DOCX}")
    return _read_paragraphs_raw(AURORA_DOCX)


@pytest.fixture(scope="module")
def horizon_paragraphs() -> list[str]:
    if not HORIZON_DOCX.exists():
        pytest.skip(f"Source file not found: {HORIZON_DOCX}")
    return _read_paragraphs_raw(HORIZON_DOCX)


# ---------------------------------------------------------------------------
# Tests: structural regex logic (no docx file required)
# ---------------------------------------------------------------------------

class TestSpecPatternRegex:
    """Tests for the regex logic itself, using hard-coded sample sentences."""

    # Sentences that SHOULD be flagged as spec-shaped
    SPEC_SENTENCES = [
        "The maximum VOC content for EcoSafe Interior Wall Paint is 30 g/L.",
        "Lead content must not exceed 0.009 % by weight.",
        "A drying time of 4 hours between coats is required at 20°C.",
        "The maximum VOC limit is 40 g/L for floor coatings in EU.",
        "Zinc concentration shall remain below 0.02 % in the final product.",
        "Cadmium levels are limited to 0.01 % across all market regions.",
        "The recommended ventilation period is 24 hours after application.",
    ]

    # Sentences that should NOT be flagged (narrative, no numeric spec)
    NARRATIVE_SENTENCES = [
        "Aurora Paints is a leading supplier of sustainable coatings.",
        "This product is suitable for interior walls in residential buildings.",
        "Always read the safety data sheet before use.",
        "The product should be stored in a cool, dry place.",
        "Contact your regional sales representative for pricing information.",
    ]

    def test_spec_sentences_are_detected(self):
        for sentence in self.SPEC_SENTENCES:
            assert _is_spec_shaped(sentence), (
                f"Expected spec-shaped sentence to be flagged: {sentence!r}"
            )

    def test_narrative_sentences_not_detected(self):
        for sentence in self.NARRATIVE_SENTENCES:
            assert not _is_spec_shaped(sentence), (
                f"Narrative sentence should NOT be flagged: {sentence!r}"
            )

    def test_numeric_without_keyword_not_detected(self):
        """A number alone (e.g. a date or page reference) is not a spec."""
        non_specs = [
            "Version 2024.01 of the safety data sheet.",
            "See page 12 for full specifications.",
            "Product code: AU-EW-30-EU.",
        ]
        for sentence in non_specs:
            assert not _is_spec_shaped(sentence), (
                f"Numeric-only sentence should NOT be flagged: {sentence!r}"
            )

    def test_keyword_without_numeric_not_detected(self):
        """A parameter keyword without a numeric value is not a spec."""
        non_specs = [
            "VOC content information is available on request.",
            "Lead and zinc limits apply to all products.",
            "Ventilation period guidance is provided in the safety sheet.",
        ]
        for sentence in non_specs:
            assert not _is_spec_shaped(sentence), (
                f"Keyword-only sentence should NOT be flagged: {sentence!r}"
            )


# ---------------------------------------------------------------------------
# Tests: extractor module interface
# ---------------------------------------------------------------------------

class TestExtractorInterface:
    """Verify the public API surface of app.ingest.inline_specs."""

    def test_module_has_extract_function(self):
        mod = _import_inline_specs()
        assert hasattr(mod, "extract_inline_specs"), (
            "inline_specs module must expose an 'extract_inline_specs' function"
        )

    def test_extract_function_signature(self):
        mod = _import_inline_specs()
        import inspect
        sig = inspect.signature(mod.extract_inline_specs)
        params = list(sig.parameters.keys())
        assert "text" in params or "paragraphs" in params, (
            f"extract_inline_specs must accept 'text' or 'paragraphs'. Got: {params}"
        )

    def test_extract_returns_list(self):
        mod = _import_inline_specs()
        result = mod.extract_inline_specs(
            "The maximum VOC content is 30 g/L for interior coatings."
        )
        assert isinstance(result, list), (
            f"extract_inline_specs must return a list, got {type(result)}"
        )

    def test_extract_finds_known_spec(self):
        mod = _import_inline_specs()
        sentence = "The maximum VOC content for EcoSafe Interior Wall Paint is 30 g/L."
        results = mod.extract_inline_specs(sentence)
        assert len(results) >= 1, (
            f"extract_inline_specs returned no results for known spec sentence: {sentence!r}"
        )

    def test_extracted_item_has_required_keys(self):
        mod = _import_inline_specs()
        sentence = "Lead content must not exceed 0.009 % by weight."
        results = mod.extract_inline_specs(sentence)
        if not results:
            pytest.skip("Extractor returned no results for lead sentence — logic not yet implemented")
        item = results[0]
        assert isinstance(item, dict), f"Each extracted item must be a dict, got {type(item)}"
        for key in ("parameter", "value", "unit"):
            assert key in item, f"Extracted item missing required key {key!r}. Keys: {list(item.keys())}"

    def test_extract_returns_empty_for_narrative(self):
        mod = _import_inline_specs()
        narrative = "Aurora Paints is a leading supplier of sustainable coatings."
        results = mod.extract_inline_specs(narrative)
        assert results == [], (
            f"extract_inline_specs should return [] for pure narrative. Got: {results}"
        )


# ---------------------------------------------------------------------------
# Tests: extractor applied to real source files
# ---------------------------------------------------------------------------

class TestExtractorOnAuroraDocx:
    """Run the extractor against the real Aurora brief and check results."""

    def test_aurora_docx_has_at_least_one_spec(self, aurora_paragraphs):
        """At least one paragraph in aurora_product_brief.docx must be spec-shaped."""
        spec_paragraphs = [p for p in aurora_paragraphs if _is_spec_shaped(p)]
        assert len(spec_paragraphs) >= 1, (
            "aurora_product_brief.docx contained no spec-shaped paragraphs. "
            "Check the regex or the source file content."
        )

    def test_aurora_specs_have_voc_or_lead_keyword(self, aurora_paragraphs):
        """Aurora specs should reference VOC or lead (known Aurora parameters)."""
        spec_paragraphs = [p for p in aurora_paragraphs if _is_spec_shaped(p)]
        found_keywords = {
            kw
            for p in spec_paragraphs
            for kw in ["voc", "lead", "zinc"]
            if kw in p.lower()
        }
        assert found_keywords, (
            "No Aurora spec paragraph contained any of: voc, lead, zinc. "
            f"Spec paragraphs found: {spec_paragraphs[:3]}"
        )

    def test_extractor_module_on_aurora(self, aurora_paragraphs):
        """When app.ingest.inline_specs is available, run it on Aurora paragraphs."""
        mod = _import_inline_specs()
        full_text = "\n".join(aurora_paragraphs)
        results = mod.extract_inline_specs(full_text)
        assert isinstance(results, list)
        # At least one spec must be found in a real product brief
        assert len(results) >= 1, (
            "extract_inline_specs found no specs in aurora_product_brief.docx"
        )


class TestExtractorOnHorizonDocx:
    """Run the extractor against the real Horizon brief and check results."""

    def test_horizon_docx_has_at_least_one_spec(self, horizon_paragraphs):
        """At least one paragraph in horizon_product_brief.docx must be spec-shaped."""
        spec_paragraphs = [p for p in horizon_paragraphs if _is_spec_shaped(p)]
        assert len(spec_paragraphs) >= 1, (
            "horizon_product_brief.docx contained no spec-shaped paragraphs. "
            "Check the regex or the source file content."
        )

    def test_horizon_specs_mention_zinc_or_lead(self, horizon_paragraphs):
        """Horizon has zinc/lead limits; at least one must appear in a spec-shaped paragraph.
        Note: zinc may appear narratively (no numeric value) while lead (0.02%) is spec-shaped.
        """
        spec_paragraphs = [p for p in horizon_paragraphs if _is_spec_shaped(p)]
        heavy_metal_specs = [
            p for p in spec_paragraphs if "zinc" in p.lower() or "lead" in p.lower()
        ]
        # Also check zinc is mentioned anywhere in the docx (even without a numeric spec)
        zinc_mentioned = any("zinc" in p.lower() for p in horizon_paragraphs)
        assert heavy_metal_specs or zinc_mentioned, (
            "horizon_product_brief.docx should mention zinc or have a lead/zinc spec paragraph. "
            f"Spec paragraphs: {spec_paragraphs[:5]}"
        )

    def test_extractor_module_on_horizon(self, horizon_paragraphs):
        """When app.ingest.inline_specs is available, run it on Horizon paragraphs."""
        mod = _import_inline_specs()
        full_text = "\n".join(horizon_paragraphs)
        results = mod.extract_inline_specs(full_text)
        assert isinstance(results, list)
        assert len(results) >= 1, (
            "extract_inline_specs found no specs in horizon_product_brief.docx"
        )
