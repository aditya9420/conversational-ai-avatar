"""
Speech-to-Text service. Wraps faster-whisper for local, streaming-friendly
transcription. Supports file paths, raw bytes (WAV, WebM, MP3, OGG, etc.),
in-memory BytesIO buffers, and numpy float32 arrays (from LiveKit or WebSockets).
"""
import io
import os
import time
import logging
import tempfile
import numpy as np
import av
from faster_whisper import WhisperModel

from app.config import settings

logger = logging.getLogger("stt-service")

_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        model_size = getattr(settings, "stt_model_size", "base")
        device = getattr(settings, "stt_device", "cpu")
        compute_type = getattr(settings, "stt_compute_type", "int8")
        logger.info(
            "Loading faster-whisper model '%s' (device=%s, compute_type=%s)...",
            model_size,
            device,
            compute_type,
        )
        _model = WhisperModel(model_size, device=device, compute_type=compute_type)
    return _model


def _decode_to_float32_pcm(audio_bytes: bytes) -> tuple[np.ndarray, float]:
    """
    Decodes arbitrary audio bytes (WebM, OGG, MP3, WAV) to 16kHz mono float32 numpy array.
    Returns: (float32_audio_array, rms_energy)
    """
    buffer = io.BytesIO(audio_bytes)
    container = av.open(buffer)
    audio_streams = [s for s in container.streams if s.type == "audio"]
    if not audio_streams:
        raise ValueError("No audio stream found in container")

    resampler = av.AudioResampler(format="flt", layout="mono", rate=16000)
    chunks = []
    for frame in container.decode(audio_streams[0]):
        for resampled in resampler.resample(frame):
            chunks.append(resampled.to_ndarray()[0])

    # Flush resampler buffer
    for resampled in resampler.resample(None):
        chunks.append(resampled.to_ndarray()[0])

    if not chunks:
        return np.zeros(0, dtype=np.float32), 0.0

    audio_array = np.concatenate(chunks)
    rms = float(np.sqrt(np.mean(audio_array ** 2))) if len(audio_array) > 0 else 0.0
    return audio_array, rms


def transcribe_audio(
    audio_source: str | bytes | io.BytesIO | np.ndarray,
    language: str | None = None,
) -> tuple[str, int, str]:
    """
    Transcribes audio from a file path, raw audio bytes, BytesIO buffer, or numpy float32 array.
    Returns: (transcript_text, latency_ms, detected_language)
    """
    start = time.perf_counter()
    model = _get_model()

    audio_input: str | np.ndarray | io.BytesIO = audio_source
    temp_file_to_clean: str | None = None
    rms_energy: float = 1.0

    try:
        if isinstance(audio_source, bytes):
            if len(audio_source) < 500:
                logger.warning("Audio payload too small (%d bytes), skipping.", len(audio_source))
                return "", int((time.perf_counter() - start) * 1000), "en"

            try:
                # Try in-memory decoding with PyAV
                audio_input, rms_energy = _decode_to_float32_pcm(audio_source)
            except Exception as dec_err:
                logger.warning("Direct av decode failed (%s), writing temp .webm file...", dec_err)
                fd, temp_path = tempfile.mkstemp(suffix=".webm")
                with os.fdopen(fd, "wb") as f:
                    f.write(audio_source)
                temp_file_to_clean = temp_path
                audio_input = temp_path

        elif isinstance(audio_source, io.BytesIO):
            try:
                audio_bytes = audio_source.getvalue()
                audio_input, rms_energy = _decode_to_float32_pcm(audio_bytes)
            except Exception:
                audio_source.seek(0)
                audio_input = audio_source

        elif isinstance(audio_source, np.ndarray):
            audio_input = audio_source
            rms_energy = float(np.sqrt(np.mean(audio_source ** 2))) if len(audio_source) > 0 else 0.0

        # Check and normalize if input is numpy array
        peak = 1.0
        if isinstance(audio_input, np.ndarray):
            duration_s = len(audio_input) / 16000.0
            peak = float(np.max(np.abs(audio_input))) if len(audio_input) > 0 else 0.0
            logger.info("Audio received: samples=%d, duration=%.2fs, peak=%.6f, rms=%.6f", len(audio_input), duration_s, peak, rms_energy)

            # If audio has no data or is less than 0.2s
            if duration_s < 0.2 or peak < 0.0003:
                logger.info("Audio is empty/dead mic (peak=%.6f, duration=%.2fs), returning empty.", peak, duration_s)
                return "", int((time.perf_counter() - start) * 1000), "en"

            # Auto-gain: normalize audio to 0.90 peak so Whisper hears soft mics clearly
            if peak > 0:
                audio_input = (audio_input / peak) * 0.90

        # Run transcription with faster-whisper
        kwargs = {
            "beam_size": 2,
            "condition_on_previous_text": False,
            "temperature": 0.0,
            "language": language or "en",
        }

        segments, info = model.transcribe(audio_input, **kwargs)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        detected_language = getattr(info, "language", "en") or "en"
        latency_ms = int((time.perf_counter() - start) * 1000)

        # Only filter hallucination if mic was near-dead (< 0.0015 raw peak)
        clean_check = text.lower().strip().rstrip(".").strip()
        if clean_check in ("you", "thank you", "bye", "thanks for watching") and peak < 0.0015:
            logger.info("Filtered silence hallucination on silent mic: %r (peak=%.6f)", text, peak)
            text = ""

        return text, latency_ms, detected_language

    finally:
        if temp_file_to_clean and os.path.exists(temp_file_to_clean):
            try:
                os.remove(temp_file_to_clean)
            except OSError:
                pass


def transcribe(audio_path: str | bytes | io.BytesIO | np.ndarray) -> tuple[str, int]:
    """
    Backward-compatible signature: returns (transcript_text, latency_ms).
    """
    text, latency_ms, _ = transcribe_audio(audio_path)
    return text, latency_ms


