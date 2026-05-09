"""CLI: python -m app.cli.ingest --sources <path>"""
from __future__ import annotations
import argparse
import logging
import os
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main():
    parser = argparse.ArgumentParser(description="Ingest source files into structured + vector stores")
    parser.add_argument(
        "--sources",
        type=Path,
        default=Path("/host/ai-company/pwc-rag-task/sources"),
        help="Path to source files directory",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(os.environ.get("DATA_DIR", "/host/ai-company/pwc-rag-task/app/data")),
        help="Path to data directory (duckdb + chroma)",
    )
    args = parser.parse_args()

    db_path = args.data_dir / "structured.duckdb"
    chroma_path = args.data_dir / "chroma"

    from ..ingest.pipeline import ingest_all
    ingest_all(args.sources, db_path, chroma_path)
    print("Ingestion complete.")


if __name__ == "__main__":
    main()
