FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    make \
    && rm -rf /var/lib/apt/lists/*

# Place app source at /workspace/app so that /workspace is the Python package root.
# PYTHONPATH=/workspace lets 'python -m app.*' and 'uvicorn app.api.main:app'
# resolve correctly when make runs from within the app directory.
WORKDIR /workspace/app

COPY . .

RUN python -m venv .venv \
    && .venv/bin/pip install --upgrade pip --no-cache-dir \
    && .venv/bin/pip install --no-cache-dir -e ".[dev]"

EXPOSE 8088

ENV PYTHONPATH=/workspace
ENV DATA_DIR=/data

CMD ["make", "serve"]
