PYTHON := $(shell command -v python3.11 2>/dev/null || command -v python3.13 2>/dev/null || command -v python3 2>/dev/null || echo /home/node/miniconda/bin/python3.13)
VENV := .venv
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
UVICORN := $(VENV)/bin/uvicorn
SOURCES := /host/ai-company/pwc-rag-task/sources

.PHONY: setup ingest test eval serve demo clean

setup:
	@echo "==> Creating venv with $(PYTHON)"
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -e ".[dev]"
	@# Install tesseract if missing
	@if ! command -v tesseract >/dev/null 2>&1; then \
		echo "==> tesseract not found; attempting apt install (requires root)"; \
		apt-get install -y tesseract-ocr 2>/dev/null || \
		echo "WARN: tesseract not installed; image OCR will be skipped"; \
	fi
	@echo "==> Setup complete"

ingest: $(VENV)/bin/activate
	$(VENV)/bin/python -m app.cli.ingest --sources $(SOURCES)

test: $(VENV)/bin/activate
	$(PYTEST) tests/ -v

eval: $(VENV)/bin/activate
	$(VENV)/bin/python eval/run.py

serve: $(VENV)/bin/activate
	$(UVICORN) app.api.main:app --host 0.0.0.0 --port 8088

demo: $(VENV)/bin/activate
	$(VENV)/bin/python -m app.cli.chat --demo

clean:
	rm -rf $(VENV) data/structured.duckdb data/chroma/ __pycache__ .pytest_cache
