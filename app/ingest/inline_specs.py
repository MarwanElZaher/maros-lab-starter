"""
Detect spec-shaped sentences in docx paragraphs and extract as structured dicts.

Public API:
  extract_inline_specs(text: str | list[str], client_name=..., source_file=..., ...)
  -> list[dict]  each dict has keys: parameter, value, unit, [+ context keys]

Used by the ingestion pipeline to find spec-shaped sentences in docx narrative
and push them to the structured store.
"""
from __future__ import annotations
import re
from typing import Union

# Parameter vocabulary (extend as needed)
PARAMETER_KEYWORDS = [
    "voc content", "voc limit", "voc", "lead", "zinc", "cadmium",
    "drying time", "ventilation period", "ventilation", "open time",
    "recoat time", "coverage", "solids", "viscosity", "flash point",
    "ph ", "density", "volatile", "heavy metal", "arsenic", "chromium",
    "mercury", "antimony", "barium", "selenium", "titanium dioxide",
    "dry film", "wet film", "gloss", "dilution", "thinning", "pot life",
]

# Unit vocabulary
UNIT_PATTERN = r"(?:g/[lL]|g/l|g/L|mg/kg|mg/L|%|ppm|ppb|h\b|hours?|days?|min|minutes?|m²/L|m2/L|Pa·?s|cP|°C|°F|µm|um)"

SPEC_REGEX = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(" + UNIT_PATTERN + r")",
    re.IGNORECASE,
)

PARAM_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in PARAMETER_KEYWORDS) + r")\b",
    re.IGNORECASE,
)


def extract_inline_specs(
    text: Union[str, list[str]],
    client_name: str = "",
    source_file: str = "",
    existing_products: list[str] | None = None,
) -> list[dict]:
    """
    Scan text (string or list of paragraph strings) for spec-shaped sentences.

    Returns list of dicts with keys:
      parameter, value, unit, client, product, region, limit_type, notes,
      source_file, source_locator
    """
    if isinstance(text, list):
        paragraphs = text
    else:
        # Split on newlines to get paragraphs
        paragraphs = [line.strip() for line in text.splitlines() if line.strip()]

    products = existing_products or []
    results: list[dict] = []

    for para_idx, para_text in enumerate(paragraphs):
        # Must have a parameter keyword AND a numeric+unit
        param_match = PARAM_RE.search(para_text)
        if not param_match:
            continue

        spec_match = SPEC_REGEX.search(para_text)
        if not spec_match:
            continue

        value_str = spec_match.group(1).replace(",", ".")
        try:
            value = float(value_str)
        except ValueError:
            continue

        unit = spec_match.group(2)
        parameter = param_match.group(1).lower().replace(" ", "_")

        product = _guess_product(para_text, products)
        region = _guess_region(para_text)
        limit_type = _guess_limit_type(para_text)

        row: dict = {
            "parameter": parameter,
            "value": value,
            "unit": unit,
            "client": client_name,
            "product": product,
            "region": region,
            "limit_type": limit_type,
            "notes": para_text[:300],
            "source_file": source_file,
            "source_locator": f"docx_para={para_idx}",
        }
        results.append(row)

    return results


def _guess_product(text: str, known_products: list[str]) -> str:
    for p in known_products:
        if p.lower() in text.lower():
            return p
    return "Unknown"


def _guess_region(text: str) -> str:
    text_lower = text.lower()
    if "eu " in text_lower or " eu" in text_lower or "european" in text_lower:
        return "EU"
    if "us " in text_lower or " us" in text_lower or "united states" in text_lower:
        return "US"
    if "gcc" in text_lower:
        return "GCC"
    return "EU"  # default


def _guess_limit_type(text: str) -> str:
    text_lower = text.lower()
    if "internal" in text_lower:
        return "internal_limit"
    if "illustrative" in text_lower:
        return "illustrative_internal_limit"
    if "guidance" in text_lower or "recommend" in text_lower:
        return "application_guideline"
    return "internal_limit"
