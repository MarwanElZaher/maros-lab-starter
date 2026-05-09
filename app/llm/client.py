"""OpenRouter LLM client via OpenAI SDK."""
from __future__ import annotations
import logging
import os
import json
import re
from typing import AsyncIterator

from openai import OpenAI, AsyncOpenAI

logger = logging.getLogger(__name__)

# Models to try in order (free-tier JSON-capable, verified 2026-05)
FREE_MODELS = [
    "google/gemma-4-31b-it:free",          # Google AI Studio, reliable
    "google/gemma-4-26b-a4b-it:free",      # Google AI Studio, smaller quota
    "liquid/lfm-2.5-1.2b-instruct:free",   # Liquid, low-latency fallback
    "openrouter/free",                      # catch-all (may pick OCR models)
]

_verified_model: str | None = None


def _client() -> OpenAI:
    return OpenAI(
        api_key=os.environ.get("OPENROUTER_API_KEY", os.environ.get("OPENAI_API_KEY", "")),
        base_url=os.environ.get("OPENAI_BASE_URL", "https://openrouter.ai/api/v1"),
    )


def _async_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=os.environ.get("OPENROUTER_API_KEY", os.environ.get("OPENAI_API_KEY", "")),
        base_url=os.environ.get("OPENAI_BASE_URL", "https://openrouter.ai/api/v1"),
    )


def get_model() -> str:
    """Return a working free model, verifying on first call."""
    global _verified_model
    if _verified_model:
        return _verified_model

    override = os.environ.get("OPENROUTER_MODEL")
    if override:
        _verified_model = override
        logger.info(f"Using configured model: {override}")
        return _verified_model

    c = _client()
    for model in FREE_MODELS:
        try:
            resp = c.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "Say 'OK' in one word."}],
                max_tokens=10,
            )
            text = (resp.choices[0].message.content or "").strip()
            if text:
                _verified_model = model
                logger.info(f"Using LLM model: {model} (responded: {text[:30]!r})")
                return model
        except Exception as e:
            logger.warning(f"Model {model} failed: {type(e).__name__}: {str(e)[:100]}")

    # Last resort
    _verified_model = FREE_MODELS[0]
    logger.warning(f"No model verified; using {_verified_model}")
    return _verified_model


def _extract_json(text: str) -> dict:
    """Extract JSON from text that may have markdown fences or extra prose."""
    text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try markdown fence
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Try first {...} block
    m = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    logger.warning(f"JSON extraction failed from: {text[:200]}")
    return {}


def chat_json(messages: list[dict], temperature: float = 0.0) -> dict:
    """Sync JSON chat — returns parsed dict."""
    c = _client()
    model = get_model()

    # Try with JSON format first, fall back to plain text
    try:
        resp = c.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            response_format={"type": "json_object"},
            max_tokens=1024,
        )
    except Exception:
        resp = c.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=1024,
        )

    text = resp.choices[0].message.content or "{}"
    return _extract_json(text)


_last_call_time: float = 0.0
_MIN_CALL_INTERVAL = 4.0  # 15 calls/min safely under 20/min limit
_response_cache: dict[str, str] = {}  # hash(messages) → response

_DISK_CACHE_PATH = os.path.join(
    os.environ.get("DATA_DIR", "/host/ai-company/pwc-rag-task/app/data"),
    "llm_cache.json",
)


def _load_disk_cache() -> None:
    """Load persisted cache entries into _response_cache on startup."""
    try:
        if os.path.exists(_DISK_CACHE_PATH):
            with open(_DISK_CACHE_PATH) as f:
                data = json.load(f)
            _response_cache.update(data)
            logger.debug(f"Loaded {len(data)} entries from disk cache")
    except Exception as e:
        logger.warning(f"Failed to load disk cache: {e}")


def _save_disk_cache() -> None:
    """Persist current in-memory cache to disk."""
    try:
        os.makedirs(os.path.dirname(_DISK_CACHE_PATH), exist_ok=True)
        with open(_DISK_CACHE_PATH, "w") as f:
            json.dump(_response_cache, f)
    except Exception as e:
        logger.warning(f"Failed to save disk cache: {e}")


_load_disk_cache()


def _msg_key(messages: list[dict]) -> str:
    import hashlib
    return hashlib.md5(str(messages).encode()).hexdigest()


def _throttle() -> None:
    """Proactively throttle LLM calls to stay under free-tier rate limit."""
    import time
    global _last_call_time
    now = time.time()
    wait = _MIN_CALL_INTERVAL - (now - _last_call_time)
    if wait > 0:
        logger.debug(f"Throttling LLM call by {wait:.1f}s")
        time.sleep(wait)
    _last_call_time = time.time()


def _models_to_try() -> list[str]:
    """Return ordered list of models to try: env-override first, then fallbacks."""
    override = os.environ.get("OPENROUTER_MODEL")
    if override:
        fallbacks = [m for m in FREE_MODELS if m != override]
        return [override] + fallbacks
    return [get_model()] + [m for m in FREE_MODELS if m != get_model()]


def chat_text(messages: list[dict], temperature: float = 0.3, max_retries: int = 2) -> str:
    """Sync text chat with proactive throttling, caching, model fallback, and retry on rate limit."""
    import time

    # Check cache first (keyed on messages content)
    cache_key = _msg_key(messages)
    if cache_key in _response_cache:
        logger.debug("LLM cache hit")
        return _response_cache[cache_key]

    _throttle()
    c = _client()
    for model in _models_to_try():
        for attempt in range(max_retries):
            try:
                resp = c.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=2048,
                )
                result = resp.choices[0].message.content or ""
                _response_cache[cache_key] = result
                _save_disk_cache()
                if model != _verified_model:
                    logger.info(f"Switched to fallback model: {model}")
                return result
            except Exception as e:
                err_str = str(e)
                if "429" in err_str:
                    if attempt < max_retries - 1:
                        wait = 20  # short wait before same-model retry
                        logger.warning(f"Rate limited on {model}, waiting {wait}s (attempt {attempt+1}/{max_retries})")
                        time.sleep(wait)
                    else:
                        logger.warning(f"Rate limited on {model} after {max_retries} retries, trying next model")
                        break  # fall through to next model
                else:
                    raise
    raise RuntimeError("All models exhausted — no successful LLM response")


async def chat_stream(messages: list[dict], temperature: float = 0.3) -> AsyncIterator[str]:
    """Async streaming chat — yields text tokens."""
    ac = _async_client()
    stream = await ac.chat.completions.create(
        model=get_model(),
        messages=messages,
        temperature=temperature,
        max_tokens=2048,
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            yield token
