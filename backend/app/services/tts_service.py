"""
Text-to-Speech service for Real-Time Conversational AI Avatar.
Supports:
  1. edge-tts (default): Microsoft high-fidelity neural voices with exact word boundary metadata.
  2. pyttsx3 (fallback): Local offline TTS engine for environments without internet.
  3. Avatar Viseme Extraction: Produces time-aligned blendshape timelines (Oculus / ARKit standards)
     for real-time lip-sync in 3D avatar renderers (Three.js, Ready Player Me, Unity, WebGL).
"""
import io
import os
import re
import time
import base64
import uuid
import logging
import asyncio
import concurrent.futures
from pathlib import Path

import av
from app.config import settings

logger = logging.getLogger("tts-service")

# Available recommended voices
AVAILABLE_VOICES = [
    {"id": "en-US-JennyNeural", "name": "Jenny (US Female - Natural)", "gender": "Female", "locale": "en-US"},
    {"id": "en-US-GuyNeural", "name": "Guy (US Male - Natural)", "gender": "Male", "locale": "en-US"},
    {"id": "en-US-AriaNeural", "name": "Aria (US Female - Expressive)", "gender": "Female", "locale": "en-US"},
    {"id": "en-IN-NeerjaNeural", "name": "Neerja (Indian English Female)", "gender": "Female", "locale": "en-IN"},
    {"id": "en-IN-PrabhatNeural", "name": "Prabhat (Indian English Male)", "gender": "Male", "locale": "en-IN"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (UK Female)", "gender": "Female", "locale": "en-GB"},
    {"id": "en-GB-RyanNeural", "name": "Ryan (UK Male)", "gender": "Male", "locale": "en-GB"},
]

# Viseme classification mappings
CHAR_TO_VISEME = {
    "a": ("viseme_aa", "AA"),
    "e": ("viseme_E", "E"),
    "i": ("viseme_I", "I"),
    "o": ("viseme_O", "O"),
    "u": ("viseme_U", "U"),
    "b": ("viseme_PP", "MBP"),
    "p": ("viseme_PP", "MBP"),
    "m": ("viseme_PP", "MBP"),
    "f": ("viseme_FF", "FV"),
    "v": ("viseme_FF", "FV"),
    "w": ("viseme_U", "U"),
    "t": ("viseme_DD", "REST"),
    "d": ("viseme_DD", "REST"),
    "s": ("viseme_SS", "REST"),
    "z": ("viseme_SS", "REST"),
    "c": ("viseme_kk", "REST"),
    "k": ("viseme_kk", "REST"),
    "g": ("viseme_kk", "REST"),
    "j": ("viseme_CH", "REST"),
    "r": ("viseme_RR", "REST"),
    "l": ("viseme_nn", "REST"),
    "n": ("viseme_nn", "REST"),
    "h": ("viseme_aa", "AA"),
}


def _run_coroutine_sync(coro):
    """Safely runs an async coroutine from either synchronous or running event loops."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


def _ensure_output_dir() -> Path:
    out_dir = Path(getattr(settings, "audio_output_dir", "static/audio"))
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def _word_to_visemes(word: str, start_time_ms: int, duration_ms: int) -> list[dict]:
    """Generates a smooth sequence of visemes for a word within its time slice."""
    clean_word = re.sub(r"[^a-zA-Z]", "", word.lower())
    if not clean_word:
        return [{"time_ms": start_time_ms, "duration_ms": duration_ms, "shape": "viseme_sil", "shape_legacy": "REST", "weight": 0.0}]

    num_chars = len(clean_word)
    slice_duration = max(30, int(duration_ms / max(1, num_chars)))
    visemes = []

    for idx, ch in enumerate(clean_word):
        shape, shape_legacy = CHAR_TO_VISEME.get(ch, ("viseme_aa", "AA"))
        t = start_time_ms + (idx * slice_duration)
        visemes.append({
            "time_ms": int(t),
            "duration_ms": slice_duration,
            "shape": shape,
            "shape_legacy": shape_legacy,
            "weight": 0.85 if shape.startswith("viseme_") and shape != "viseme_sil" else 0.4,
        })

    return visemes


def _generate_viseme_timeline(words_with_timing: list[dict], total_duration_ms: int) -> list[dict]:
    """Builds a complete sorted viseme timeline with start and closing rests."""
    timeline = []
    # Start at rest
    timeline.append({
        "time_ms": 0,
        "duration_ms": 50,
        "shape": "viseme_sil",
        "shape_legacy": "REST",
        "weight": 0.0,
    })

    for item in words_with_timing:
        word = item["word"]
        start_ms = item["offset_ms"]
        dur_ms = item["duration_ms"]
        timeline.extend(_word_to_visemes(word, start_ms, dur_ms))

    # Conclude with rest
    end_time = max(total_duration_ms, timeline[-1]["time_ms"] + timeline[-1]["duration_ms"] if timeline else 0)
    timeline.append({
        "time_ms": int(end_time),
        "duration_ms": 100,
        "shape": "viseme_sil",
        "shape_legacy": "REST",
        "weight": 0.0,
    })

    return timeline


async def _synthesize_edge_tts(text: str, voice: str) -> tuple[bytes, list[dict], int]:
    """
    Synthesizes speech using edge-tts.
    Returns: (mp3_bytes, words_with_timing, duration_ms)
    """
    import edge_tts

    voice = voice or getattr(settings, "tts_voice", "en-US-JennyNeural")
    rate = getattr(settings, "tts_rate", "+0%")
    pitch = getattr(settings, "tts_pitch", "+0Hz")

    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        boundary="WordBoundary",
    )

    audio_chunks = bytearray()
    words_timing = []

    async for chunk in communicate.stream():
        chunk_type = chunk.get("type")
        if chunk_type == "audio":
            audio_chunks.extend(chunk["data"])
        elif chunk_type == "WordBoundary":
            # Offset and duration are in 100-nanosecond ticks (1 tick = 10^-7 sec = 10^-4 ms)
            offset_ms = int(chunk["offset"] / 10000)
            duration_ms = max(50, int(chunk["duration"] / 10000))
            words_timing.append({
                "word": chunk.get("text", ""),
                "offset_ms": offset_ms,
                "duration_ms": duration_ms,
            })

    mp3_bytes = bytes(audio_chunks)

    # Determine exact audio duration by decoding with PyAV
    duration_ms = 0
    if mp3_bytes:
        try:
            container = av.open(io.BytesIO(mp3_bytes))
            stream = container.streams.audio[0]
            if stream.duration and stream.time_base:
                duration_ms = int(float(stream.duration * stream.time_base) * 1000)
            else:
                # Calculate from sample count
                total_samples = 0
                for frame in container.decode(audio=0):
                    total_samples += frame.samples
                if stream.rate:
                    duration_ms = int((total_samples / stream.rate) * 1000)
        except Exception as e:
            logger.warning("Could not calculate precise duration via av: %s", e)
            if words_timing:
                duration_ms = words_timing[-1]["offset_ms"] + words_timing[-1]["duration_ms"] + 150
            else:
                duration_ms = max(500, len(text.split()) * 300)

    return mp3_bytes, words_timing, duration_ms


def _synthesize_pyttsx3(text: str) -> tuple[bytes, list[dict], int]:
    """
    Offline TTS fallback using pyttsx3 (SAPI5 on Windows).
    Returns: (wav_bytes, words_timing, duration_ms)
    """
    import pyttsx3
    import tempfile
    import wave

    engine = pyttsx3.init()
    engine.setProperty("rate", 160)

    fd, temp_wav = tempfile.mkstemp(suffix=".wav")
    os.close(fd)

    try:
        engine.save_to_file(text, temp_wav)
        engine.runAndWait()

        with open(temp_wav, "rb") as f:
            wav_bytes = f.read()

        duration_ms = 1000
        try:
            with wave.open(temp_wav, "r") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate > 0:
                    duration_ms = int((frames / float(rate)) * 1000)
        except Exception:
            pass

        # Estimate word boundaries evenly across duration
        words = text.split()
        words_timing = []
        if words:
            ms_per_word = max(100, int(duration_ms / len(words)))
            for i, w in enumerate(words):
                words_timing.append({
                    "word": w,
                    "offset_ms": i * ms_per_word,
                    "duration_ms": ms_per_word,
                })

        return wav_bytes, words_timing, duration_ms
    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except OSError:
                pass


def synthesize(text: str, voice: str | None = None) -> dict:
    """
    Synthesizes speech for `text` and generates time-aligned avatar visemes.
    Returns:
      {
        "audio_path": str,         # Path on local disk
        "audio_url": str,          # Client-accessible URL (/static/audio/...)
        "audio_base64": str,       # base64 data URI (data:audio/mp3;base64,...)
        "audio_duration_ms": int,  # Duration of spoken audio in ms
        "visemes": [               # Visemes blendshapes for 3D avatar lip-sync
           {"time_ms": int, "duration_ms": int, "shape": str, "shape_legacy": str, "weight": float}, ...
        ],
        "latency_ms": int,         # Synthesis latency in ms
        "engine": str,             # "edge-tts" or "pyttsx3"
        "voice": str,              # Voice identifier
      }
    """
    start = time.perf_counter()
    out_dir = _ensure_output_dir()
    file_id = str(uuid.uuid4())
    preferred_voice = voice or getattr(settings, "tts_voice", "en-US-JennyNeural")
    engine_name = getattr(settings, "tts_engine", "edge-tts")

    audio_bytes = b""
    words_timing = []
    duration_ms = 0
    ext = "mp3"
    mime = "audio/mpeg"

    # Attempt primary engine
    if engine_name == "edge-tts":
        try:
            audio_bytes, words_timing, duration_ms = _run_coroutine_sync(
                _synthesize_edge_tts(text, preferred_voice)
            )
            ext = "mp3"
            mime = "audio/mpeg"
        except Exception as exc:
            logger.warning("edge-tts synthesis failed (%s). Falling back to pyttsx3...", exc)
            audio_bytes, words_timing, duration_ms = _synthesize_pyttsx3(text)
            engine_name = "pyttsx3"
            preferred_voice = "system-default"
            ext = "wav"
            mime = "audio/wav"
    else:
        audio_bytes, words_timing, duration_ms = _synthesize_pyttsx3(text)
        engine_name = "pyttsx3"
        preferred_voice = "system-default"
        ext = "wav"
        mime = "audio/wav"

    filename = f"{file_id}.{ext}"
    output_path = out_dir / filename
    output_path.write_bytes(audio_bytes)

    # Build viseme timeline
    visemes = _generate_viseme_timeline(words_timing, duration_ms)

    # Encode base64 data URI for zero-latency direct web client playback
    b64_str = base64.b64encode(audio_bytes).decode("ascii")
    audio_base64 = f"data:{mime};base64,{b64_str}"
    audio_url = f"/static/audio/{filename}"

    latency_ms = int((time.perf_counter() - start) * 1000)

    return {
        "audio_path": str(output_path),
        "audio_url": audio_url,
        "audio_base64": audio_base64,
        "audio_duration_ms": duration_ms,
        "duration_ms": duration_ms,
        "visemes": visemes,
        "latency_ms": latency_ms,
        "engine": engine_name,
        "voice": preferred_voice,
    }


def synthesize_pcm(
    text: str,
    voice: str | None = None,
    target_sample_rate: int = 24000,
) -> tuple[bytes, int, int]:
    """
    Synthesizes speech to raw 16-bit mono PCM bytes for real-time streaming (LiveKit / WebSockets).
    Returns: (pcm_bytes, sample_rate, num_channels)
    """
    result = synthesize(text, voice)
    audio_path = result["audio_path"]

    container = av.open(audio_path)
    resampler = av.AudioResampler(format="s16", layout="mono", rate=target_sample_rate)
    pcm_chunks = []

    for frame in container.decode(audio=0):
        for resampled in resampler.resample(frame):
            pcm_chunks.append(resampled.to_ndarray().tobytes())

    return b"".join(pcm_chunks), target_sample_rate, 1


def list_voices() -> list[dict]:
    """Returns available avatar voice options."""
    return AVAILABLE_VOICES

