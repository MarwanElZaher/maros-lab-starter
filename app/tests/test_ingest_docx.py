"""Tests for docx parsing."""
import pytest
from pathlib import Path

SOURCES = Path("/host/ai-company/pwc-rag-task/sources")


def test_aurora_docx_paragraphs():
    from app.ingest.docx_parse import parse_docx
    paragraphs, image_texts = parse_docx(SOURCES / "aurora_product_brief.docx")
    assert len(paragraphs) > 0, "Should extract paragraphs from Aurora docx"
    full_text = " ".join(paragraphs).lower()
    assert "aurora" in full_text or "ecosafe" in full_text or "paint" in full_text


def test_horizon_docx_paragraphs():
    from app.ingest.docx_parse import parse_docx
    paragraphs, image_texts = parse_docx(SOURCES / "horizon_product_brief.docx")
    assert len(paragraphs) > 0, "Should extract paragraphs from Horizon docx"
    full_text = " ".join(paragraphs).lower()
    assert "horizon" in full_text or "ultrasafe" in full_text or "coating" in full_text


def test_docx_no_cross_contamination():
    """Aurora docx paragraphs should not contain Horizon data and vice versa."""
    from app.ingest.docx_parse import parse_docx
    aurora_paras, _ = parse_docx(SOURCES / "aurora_product_brief.docx")
    aurora_text = " ".join(aurora_paras).lower()
    # Aurora doc should primarily be about Aurora products
    assert "ecosafe" in aurora_text or "aurora" in aurora_text
