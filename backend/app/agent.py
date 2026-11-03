"""
LiveKit Agent entrypoint — runs the full real-time voice pipeline per room:

  audio in -> STT (faster-whisper) -> [MySQL context lookup] -> Gemini LLM stream -> [MySQL logging]
           -> TTS (edge-tts / pyttsx3) -> visemes out (to the frontend avatar via LiveKit data channel)

Run with:
    python -m app.agent dev
or deploy with the LiveKit Agents worker CLI in production.
"""
import json
import time
import uuid
import asyncio
import logging
import numpy as np
import scipy.signal

from livekit.agents import (
    JobContext,
    WorkerOptions,
    cli,
    llm,
    stt,
    tts,
    voice,
    utils,
    NOT_GIVEN,
    NotGivenOr,
    APIConnectOptions,
    DEFAULT_API_CONNECT_OPTIONS,
)
from livekit.plugins import silero

from app.database import SessionLocal
from app.models.models import Session as SessionModel, ConversationLog, SystemMetric, ApiUsage
from app.services import context_service, gemini_service, stt_service, tts_service
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-avatar-agent")


# ---------------------------------------------------------------------------
# 1. Custom STT Plugin (backed by faster-whisper)
# ---------------------------------------------------------------------------
class FasterWhisperSTT(stt.STT):
    """LiveKit STT adapter wrapping faster-whisper for speech-to-text."""

    def __init__(self):
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False)
        )

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechEvent:
        combined = utils.merge_frames(buffer)
        data_s16 = np.frombuffer(combined.data, dtype=np.int16)
        audio_float = data_s16.astype(np.float32) / 32768.0

        # Resample to 16kHz if necessary
        if combined.sample_rate != 16000 and len(audio_float) > 0:
            target_len = int(len(audio_float) * 16000 / combined.sample_rate)
            audio_float = scipy.signal.resample(audio_float, target_len).astype(np.float32)

        lang_str = None if language is NOT_GIVEN else language
        text, latency_ms, detected_lang = stt_service.transcribe_audio(audio_float, language=lang_str)
        duration = len(audio_float) / 16000.0 if len(audio_float) > 0 else 0.0

        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[
                stt.SpeechData(
                    text=text,
                    language=detected_lang,
                    start_time=0.0,
                    end_time=duration,
                    confidence=1.0,
                )
            ],
        )


# ---------------------------------------------------------------------------
# 2. Custom TTS Plugin (backed by edge-tts / pyttsx3)
# ---------------------------------------------------------------------------
class EdgeTTSChunkedStream(tts.ChunkedStream):
    def __init__(
        self,
        *,
        tts_instance: tts.TTS,
        input_text: str,
        conn_options: APIConnectOptions,
    ):
        super().__init__(tts=tts_instance, input_text=input_text, conn_options=conn_options)

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = str(uuid.uuid4())
        output_emitter.initialize(
            request_id=request_id,
            sample_rate=self._tts.sample_rate,
            num_channels=self._tts.num_channels,
            mime_type="audio/pcm",
        )

        try:
            pcm_bytes, _, _ = tts_service.synthesize_pcm(
                self._input_text,
                target_sample_rate=self._tts.sample_rate,
            )
            if pcm_bytes:
                output_emitter.push(pcm_bytes)
        except Exception as exc:
            logger.error("TTS audio synthesis error: %s", exc)

        output_emitter.flush()


class EdgeTTSPlugin(tts.TTS):
    """LiveKit TTS adapter wrapping edge-tts with pyttsx3 fallback."""

    def __init__(self, sample_rate: int = 24000):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate,
            num_channels=1,
        )

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        return EdgeTTSChunkedStream(
            tts_instance=self,
            input_text=text,
            conn_options=conn_options,
        )


# ---------------------------------------------------------------------------
# 3. Gemini LLM Adapter with Streaming and MySQL Logging
# ---------------------------------------------------------------------------
class GeminiLLMStream(llm.LLMStream):
    def __init__(
        self,
        llm_instance: llm.LLM,
        *,
        chat_ctx: llm.ChatContext,
        tools: list,
        conn_options: APIConnectOptions,
        db_session_id: str,
    ):
        super().__init__(
            llm_instance,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )
        self.db_session_id = db_session_id

    async def _run(self) -> None:
        db = SessionLocal()
        try:
            turn_index = context_service.get_next_turn_index(db, self.db_session_id)
            history = context_service.get_recent_turns(db, self.db_session_id)

            # Extract user message
            user_message = ""
            for msg in reversed(self._chat_ctx.messages):
                if msg.role in (llm.ChatRole.USER, "user"):
                    user_message = msg.content if isinstance(msg.content, str) else str(msg.content)
                    break

            if not user_message and self._chat_ctx.messages:
                last = self._chat_ctx.messages[-1]
                user_message = last.content if isinstance(last.content, str) else str(last.content)

            kb_context = context_service.search_knowledge_base(db, user_message)

            db.add(ConversationLog(
                session_id=self.db_session_id,
                role="user",
                message_text=user_message,
                turn_index=turn_index,
            ))
            db.commit()

            contents = history + [{"role": "user", "parts": [{"text": user_message}]}]

            start = time.perf_counter()
            full_reply_parts = []

            for chunk_text in gemini_service.generate_reply_stream(contents, kb_context):
                full_reply_parts.append(chunk_text)
                self._event_ch.send_nowait(
                    llm.ChatChunk(
                        delta=llm.ChoiceDelta(role="assistant", content=chunk_text)
                    )
                )

            total_ms = int((time.perf_counter() - start) * 1000)
            full_reply = "".join(full_reply_parts).strip()

            assistant_log = ConversationLog(
                session_id=self.db_session_id,
                role="assistant",
                message_text=full_reply,
                turn_index=turn_index + 1,
            )
            db.add(assistant_log)
            db.flush()

            db.add(SystemMetric(
                session_id=self.db_session_id,
                log_id=assistant_log.log_id,
                llm_latency_ms=total_ms,
                total_latency_ms=total_ms,
            ))
            db.add(ApiUsage(session_id=self.db_session_id, model_name=settings.gemini_model))
            db.commit()

        finally:
            db.close()


class GeminiLLMAdapter(llm.LLM):
    """Adapts gemini_service into the LiveKit LLM interface with MySQL persistence."""

    def __init__(self, db_session_id: str):
        super().__init__()
        self.db_session_id = db_session_id

    @property
    def model(self) -> str:
        return settings.gemini_model

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: list | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        **kwargs,
    ) -> llm.LLMStream:
        return GeminiLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
            db_session_id=self.db_session_id,
        )


# ---------------------------------------------------------------------------
# 4. LiveKit Job Entrypoint
# ---------------------------------------------------------------------------
async def entrypoint(ctx: JobContext):
    await ctx.connect()

    db = SessionLocal()
    try:
        db_session = SessionModel(user_id=ctx.room.metadata or "anonymous", room_name=ctx.room.name)
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        session_id = db_session.session_id
    finally:
        db.close()

    vad_plugin = silero.VAD.load()
    stt_plugin = stt.StreamAdapter(stt=FasterWhisperSTT(), vad=vad_plugin)
    tts_plugin = EdgeTTSPlugin(sample_rate=24000)
    llm_plugin = GeminiLLMAdapter(db_session_id=session_id)

    agent_session = voice.AgentSession(
        vad=vad_plugin,
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
    )

    agent = voice.Agent(
        instructions=(
            "You are a helpful, concise voice assistant embodied as a 3D avatar. "
            "Keep responses natural and conversational, suitable for being spoken aloud. "
            "Avoid long lists or markdown formatting."
        )
    )

    @agent_session.on("speech_created")
    def _on_speech(ev):
        """Extracts visemes and broadcasts them over the LiveKit data channel for lip-sync."""
        try:
            content = getattr(ev, "text", "") or ""
            if content:
                viseme_res = tts_service.synthesize(content)
                payload = json.dumps({
                    "type": "visemes",
                    "visemes": viseme_res["visemes"],
                    "audio_duration_ms": viseme_res["audio_duration_ms"],
                })
                asyncio.create_task(ctx.room.local_participant.publish_data(payload))
                logger.info("Published %d visemes to room data channel", len(viseme_res["visemes"]))
        except Exception as exc:
            logger.warning("Viseme broadcast error: %s", exc)

    await agent_session.start(agent, room=ctx.room)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

