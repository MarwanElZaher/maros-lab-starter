"""Extract embedded images from .docx and OCR them with pytesseract."""
from __future__ import annotations
import io
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _tesseract_available() -> bool:
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def extract_image_texts(docx_path: Path) -> list[dict]:
    """Return list of {para_idx, text} dicts from OCR of embedded images."""
    try:
        from docx import Document
        from PIL import Image
        import pytesseract
    except ImportError:
        logger.warning("pytesseract/Pillow not installed — skipping image OCR")
        return []

    if not _tesseract_available():
        logger.warning("tesseract not installed — skipping image OCR")
        return []

    results: list[dict] = []
    doc = Document(str(docx_path))

    # Walk inline shapes/relationships
    rel_idx = 0
    for para_idx, para in enumerate(doc.paragraphs):
        for run in para.runs:
            for elem in run._element:
                tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                if tag in ("drawing", "pict"):
                    # Try to find image rels
                    for rel in doc.part.rels.values():
                        if "image" in rel.reltype:
                            try:
                                img_data = rel.target_part.blob
                                img = Image.open(io.BytesIO(img_data))
                                text = pytesseract.image_to_string(img).strip()
                                if text:
                                    results.append(
                                        {
                                            "para_idx": para_idx,
                                            "rel_idx": rel_idx,
                                            "text": text,
                                        }
                                    )
                                rel_idx += 1
                            except Exception as e:
                                logger.debug(f"OCR error: {e}")

    # Simpler fallback: iterate all image rels directly
    if not results:
        for rel in doc.part.rels.values():
            if "image" in rel.reltype:
                try:
                    img_data = rel.target_part.blob
                    img = Image.open(io.BytesIO(img_data))
                    text = pytesseract.image_to_string(img).strip()
                    if text:
                        results.append({"para_idx": -1, "rel_idx": rel_idx, "text": text})
                    rel_idx += 1
                except Exception as e:
                    logger.debug(f"OCR error: {e}")

    return results
