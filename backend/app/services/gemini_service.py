"""
Wrapper around Google's Gemini API. Keeps all google-genai SDK specifics in one
place so the rest of the backend just calls generate() / generate_stream().
"""
import time
from collections.abc import Iterator

from google import genai
from google.genai import types

from app.config import settings

import logging

logger = logging.getLogger("gemini-service")
_client = None


def _get_client():
    global _client
    if _client is None:
        key = settings.gemini_api_key.strip()
        if not key or key == "your_gemini_api_key_here":
            logger.warning("GEMINI_API_KEY is not set. Using dev fallback response.")
            return None
        _client = genai.Client(api_key=key)
    return _client

SYSTEM_INSTRUCTION = (
    "You are a helpful, concise voice assistant embodied as a 3D avatar. "
    "Keep responses natural and conversational, suitable for being spoken aloud. "
    "Avoid long lists or markdown formatting."
)


def _get_candidate_models() -> list[str]:
    primary = getattr(settings, "gemini_model", "gemini-3.5-flash-lite").strip()
    candidates = [primary]
    for fb in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]:
        if fb not in candidates:
            candidates.append(fb)
    return candidates


def generate_reply(contents: list[dict], knowledge_context: list[str] | None = None) -> tuple[str, int]:
    """
    Non-streaming call. Returns (reply_text, latency_ms).
    `contents` is a list of {"role": "user"|"model", "parts": [{"text": ...}]}.
    Automatically fails over across candidate models if 429 or 503 is encountered.
    """
    client = _get_client()
    if client is None:
        # Dev fallback when API key is not configured
        fallback = (
            "Hello! I am your conversational AI avatar. Please configure your GEMINI_API_KEY "
            "in the backend .env file to enable full real-time intelligence."
        )
        return fallback, 10

    system_text = SYSTEM_INSTRUCTION
    if knowledge_context:
        system_text += "\n\nRelevant background information:\n" + "\n".join(knowledge_context)

    start = time.perf_counter()
    models = _get_candidate_models()
    last_error = None

    for model_name in models:
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_text,
                        temperature=0.7,
                        max_output_tokens=512,
                    ),
                )
                latency_ms = int((time.perf_counter() - start) * 1000)
                if response and response.text:
                    return response.text.strip(), latency_ms
            except Exception as exc:
                last_error = exc
                err_str = str(exc)
                logger.warning(
                    "Gemini API attempt %d for model '%s' failed: %s",
                    attempt + 1,
                    model_name,
                    err_str[:200],
                )
                # If rate limited (429) or overloaded (503), immediately failover to next model
                if "429" in err_str or "503" in err_str or "RESOURCE_EXHAUSTED" in err_str or "UNAVAILABLE" in err_str:
                    logger.info("High demand or quota limit on '%s', immediately trying backup model...", model_name)
                    break
                time.sleep(0.5 * (attempt + 1))

    logger.error("All Gemini candidate models failed: %s", last_error)
    return (
        "I apologize, but I am experiencing a brief network surge right now. Please ask me again in a moment.",
        int((time.perf_counter() - start) * 1000),
    )


def generate_reply_stream(
    contents: list[dict], knowledge_context: list[str] | None = None
) -> Iterator[str]:
    """
    Streaming call — yields text chunks as they arrive so TTS can start
    speaking before the full reply is generated.
    Automatically fails over across candidate models if one encounters errors.
    """
    client = _get_client()
    if client is None:
        fallback = (
            "Hello! I am your conversational AI avatar. Please configure your GEMINI_API_KEY "
            "in the backend .env file to enable full real-time intelligence."
        )
        for word in fallback.split():
            yield word + " "
        return

    system_text = SYSTEM_INSTRUCTION
    if knowledge_context:
        system_text += "\n\nRelevant background information:\n" + "\n".join(knowledge_context)

    models = _get_candidate_models()
    for model_name in models:
        try:
            stream = client.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_text,
                    temperature=0.7,
                    max_output_tokens=512,
                ),
            )
            has_yielded = False
            for chunk in stream:
                if chunk.text:
                    has_yielded = True
                    yield chunk.text
            if has_yielded:
                return
        except Exception as exc:
            logger.warning("Gemini stream failed on model '%s': %s", model_name, exc)
            continue

    yield "I apologize, but I am experiencing a brief network surge. Please try again shortly."


