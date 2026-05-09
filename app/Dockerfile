FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN python -m venv .venv \
    && .venv/bin/pip install --upgrade pip --no-cache-dir \
    && .venv/bin/pip install --no-cache-dir -e ".[dev]"

EXPOSE 8088

ENV DATA_DIR=/data

CMD ["make", "serve"]
