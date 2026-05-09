"""
ingest_all() — orchestrate ingestion of all 4 source files.
"""
from __future__ import annotations
import logging
from pathlib import Path

from .excel import load_xlsx
from .docx_parse import parse_docx
from .inline_specs import extract_inline_specs
from .schemas import CLIENT_CONFIGS
from ..stores.structured import StructuredStore
from ..stores.vector import VectorStore

logger = logging.getLogger(__name__)


def ingest_all(sources_dir: Path, db_path: Path, chroma_path: Path) -> None:
    structured = StructuredStore(db_path)
    vector = VectorStore(chroma_path)

    structured.reset()

    for client_key, cfg in CLIENT_CONFIGS.items():
        client_name = cfg["name"]
        logger.info(f"Ingesting {client_name}...")

        # --- Structured: xlsx ---
        xlsx_path = sources_dir / cfg["xlsx"]
        if xlsx_path.exists():
            rows = load_xlsx(xlsx_path, client_key)
            logger.info(f"  xlsx: {len(rows)} rows from {cfg['xlsx']}")
            structured.insert_rows(rows)  # UnifiedRow objects
        else:
            logger.warning(f"  xlsx not found: {xlsx_path}")
            rows = []

        # --- Unstructured: docx ---
        docx_path = sources_dir / cfg["docx"]
        if docx_path.exists():
            paragraphs, image_texts = parse_docx(docx_path)
            logger.info(f"  docx: {len(paragraphs)} paragraphs, {len(image_texts)} image OCR results")

            # Inline spec extraction — returns list[dict]
            known_products = list({r.product for r in rows if r.product and r.product != "Unknown"})
            inline_dicts = extract_inline_specs(
                paragraphs,
                client_name=client_name,
                source_file=cfg["docx"],
                existing_products=known_products,
            )
            logger.info(f"  inline specs from docx: {len(inline_dicts)} rows")
            # insert_rows accepts list[dict] directly
            structured.insert_rows(inline_dicts)

            # Vector store — paragraphs
            docs = [
                {
                    "id": f"{client_key}_para_{i}",
                    "text": para,
                    "metadata": {
                        "client": client_name,
                        "source_file": cfg["docx"],
                        "source_locator": f"docx_para={i}",
                        "source_type": "docx_paragraph",
                    },
                }
                for i, para in enumerate(paragraphs)
            ]

            # Vector store — image OCR
            for img_info in image_texts:
                docs.append(
                    {
                        "id": f"{client_key}_img_{img_info.get('rel_idx', 0)}",
                        "text": img_info["text"],
                        "metadata": {
                            "client": client_name,
                            "source_file": cfg["docx"],
                            "source_locator": "image_ocr",
                            "source_type": "image_ocr",
                        },
                    }
                )

            if docs:
                vector.add_documents(cfg["chroma_collection"], docs)
                logger.info(f"  vector: {len(docs)} docs added to {cfg['chroma_collection']}")
        else:
            logger.warning(f"  docx not found: {docx_path}")

    logger.info("Ingestion complete.")
