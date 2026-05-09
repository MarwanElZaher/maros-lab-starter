"""Shared fixtures for tests."""
import os
import pytest
from pathlib import Path

# Point to the installed Python to run imports
os.environ.setdefault(
    "DATA_DIR",
    str(Path(__file__).parent.parent / "data"),
)

SOURCES_DIR = Path("/host/ai-company/pwc-rag-task/sources")
DATA_DIR = Path(__file__).parent.parent / "data"
DB_PATH = DATA_DIR / "structured.duckdb"
CHROMA_PATH = DATA_DIR / "chroma"


@pytest.fixture(scope="session")
def sources_dir():
    return SOURCES_DIR


@pytest.fixture(scope="session")
def structured_store():
    from app.stores.structured import StructuredStore
    store = StructuredStore(DB_PATH)
    return store


@pytest.fixture(scope="session")
def vector_store():
    from app.stores.vector import VectorStore
    return VectorStore(CHROMA_PATH)
