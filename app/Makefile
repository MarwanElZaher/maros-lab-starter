PYTHON := $(shell command -v python3.11 2>/dev/null || test -x /home/node/python311/bin/python3.11 && echo /home/node/python311/bin/python3.11 || command -v python3 2>/dev/null || echo /home/node/miniconda/bin/python3.13)
VENV := .venv
# Fall back to system Python when .venv not present (e.g. disk-full CI environments)
PIP     := $(shell test -x $(VENV)/bin/pip     && echo $(VENV)/bin/pip     || echo $(PYTHON) -m pip)
PYTEST  := $(shell test -x $(VENV)/bin/pytest  && echo $(VENV)/bin/pytest  || echo $(PYTHON) -m pytest)
UVICORN := $(shell test -x $(VENV)/bin/uvicorn && echo $(VENV)/bin/uvicorn || echo $(PYTHON) -m uvicorn)
RUNPY   := $(shell test -x $(VENV)/bin/python  && echo $(VENV)/bin/python  || echo $(PYTHON))
SOURCES := /host/ai-company/pwc-rag-task/sources

.PHONY: setup ingest test eval serve demo clean

setup:
	@echo "==> Creating venv with $(PYTHON)"
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -e ".[dev]"
	@# Install tesseract if missing
	@if ! command -v tesseract >/dev/null 2>&1; then \
		echo "==> tesseract not found; attempting apt install (requires root)"; \
		apt-get install -y tesseract-ocr 2>/dev/null || \
		echo "WARN: tesseract not installed; image OCR will be skipped"; \
	fi
	@echo "==> Setup complete"

ingest:
	$(RUNPY) -m app.cli.ingest --sources $(SOURCES)

test:
	$(PYTEST) tests/ -v

eval:
	$(RUNPY) eval/run.py

serve:
	$(UVICORN) app.api.main:app --host 0.0.0.0 --port 8088

demo:
	$(RUNPY) -m app.cli.chat --demo

clean:
	rm -rf $(VENV) data/structured.duckdb data/chroma/ __pycache__ .pytest_cache
