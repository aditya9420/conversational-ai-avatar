import time
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session as DBSession

from app.database import get_db, SessionLocal
from app.models.models import Session as SessionModel, ConversationLog, SystemMetric, ApiUsage
from app.schemas import (
    ChatRequest, ChatResponse,
    TTSRequest, TTSResponse,
    STTResponse, VoiceTurnResponse,
    VisemeFrame,
)
from app.services import context_service, gemini_service, stt_service, tts_service
from app.config import settings

logger = logging.getLogger("chat-router")
router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/voices")
def get_voices():
    """Returns available avatar voices for speech synthesis."""
    return {"voices": tts_service.list_voices()}


@router.post("/", response_model=ChatResponse)
def chat_turn(payload: ChatRequest, db: DBSession = Depends(get_db)):
    """
    Standard conversational turn (text in -> text out, with optional voice synthesis out):
      1. Validate session
      2. Pull recent context from MySQL + RAG
      3. Log the user's message
      4. Call Gemini
      5. Optionally synthesize voice speech + visemes if synthesize_voice is True
      6. Log assistant reply, latencies (LLM, TTS, total) + API usage
    """
    overall_start = time.perf_counter()
    session = db.query(SessionModel).filter(SessionModel.session_id == payload.session_id).first()
    if not session or session.status != "active":
        raise HTTPException(status_code=404, detail="Active session not found")

    turn_index = context_service.get_next_turn_index(db, payload.session_id)
    history = context_service.get_recent_turns(db, payload.session_id)
    kb_context = context_service.search_knowledge_base(db, payload.message)

    # 1. Log user turn
    user_log = ConversationLog(
        session_id=payload.session_id,
        role="user",
        message_text=payload.message,
        turn_index=turn_index,
    )
    db.add(user_log)
    db.commit()

    # 2. Call Gemini with history + new user message
    contents = history + [{"role": "user", "parts": [{"text": payload.message}]}]

    turn_start = time.perf_counter()
    try:
        reply_text, llm_latency_ms = gemini_service.generate_reply(contents, kb_context)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}")

    # 3. Optional voice synthesis (TTS + Visemes)
    audio_url = None
    audio_base64 = None
    audio_duration_ms = None
    viseme_objs = None
    tts_latency_ms = None

    if payload.synthesize_voice:
        try:
            tts_res = tts_service.synthesize(reply_text, voice=payload.voice)
            audio_url = tts_res["audio_url"]
            audio_base64 = tts_res["audio_base64"]
            audio_duration_ms = tts_res["audio_duration_ms"]
            viseme_objs = [VisemeFrame(**v) for v in tts_res["visemes"]]
            tts_latency_ms = tts_res["latency_ms"]
        except Exception as tts_err:
            logger.error("TTS synthesis error during chat turn: %s", tts_err)

    total_latency_ms = int((time.perf_counter() - overall_start) * 1000)

    # 4. Log assistant turn
    assistant_log = ConversationLog(
        session_id=payload.session_id,
        role="assistant",
        message_text=reply_text,
        turn_index=turn_index + 1,
    )
    db.add(assistant_log)
    db.flush()

    # 5. Log metrics + API usage
    db.add(SystemMetric(
        session_id=payload.session_id,
        log_id=assistant_log.log_id,
        llm_latency_ms=llm_latency_ms,
        tts_latency_ms=tts_latency_ms,
        total_latency_ms=total_latency_ms,
    ))
    db.add(ApiUsage(
        session_id=payload.session_id,
        model_name=settings.gemini_model,
    ))
    db.commit()

    return ChatResponse(
        session_id=payload.session_id,
        reply=reply_text,
        turn_index=turn_index + 1,
        llm_latency_ms=llm_latency_ms,
        audio_url=audio_url,
        audio_base64=audio_base64,
        audio_duration_ms=audio_duration_ms,
        visemes=viseme_objs,
        tts_latency_ms=tts_latency_ms,
        total_latency_ms=total_latency_ms,
    )


@router.post("/voice", response_model=VoiceTurnResponse)
async def voice_turn(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    voice: str | None = Form(None),
    db: DBSession = Depends(get_db),
):
    """
    Full real-time voice conversational turn (voice in -> voice + visemes out):
      1. Receive user speech audio (WebM, WAV, MP3, OGG)
      2. STT: Transcribe speech with faster-whisper (tracks stt_latency_ms)
      3. Context: Fetch conversation history + MySQL RAG
      4. Log user turn to MySQL
      5. LLM: Generate natural voice response via Gemini (tracks llm_latency_ms)
      6. TTS: Synthesize speech audio + time-aligned viseme blendshapes (tracks tts_latency_ms)
      7. Log assistant turn + record all latencies in system_metrics table
      8. Return user transcript, avatar speech audio (URL + base64), and visemes timeline
    """
    overall_start = time.perf_counter()

    # 1. Validate session
    session = db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
    if not session or session.status != "active":
        raise HTTPException(status_code=404, detail="Active session not found")

    # 2. STT: Transcribe user voice audio
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file provided")

    logger.info("Received voice audio upload: %d bytes (filename=%s)", len(audio_bytes), file.filename)
    try:
        with open("static/audio/debug_last_upload.webm", "wb") as f:
            f.write(audio_bytes)
    except Exception as save_err:
        logger.warning("Could not save debug upload: %s", save_err)

    try:
        user_transcript, stt_latency_ms, detected_lang = stt_service.transcribe_audio(audio_bytes)
        logger.info("STT Result: transcript=%r, lang=%s, latency=%dms", user_transcript, detected_lang, stt_latency_ms)
    except Exception as exc:
        logger.exception("STT processing error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Speech recognition error: {exc}")


    if not user_transcript or user_transcript.strip() in ("", "(inaudible speech)"):
        logger.info("No speech detected in audio upload for session %s", session_id)
        reply_text = "I couldn't hear anything. Please click the button, speak into your microphone, and click stop when you're done."
        tts_res = tts_service.synthesize(reply_text, voice=voice)
        turn_index = context_service.get_next_turn_index(db, session_id)
        
        user_log = ConversationLog(
            session_id=session_id,
            role="user",
            message_text="(no speech detected)",
            turn_index=turn_index,
        )
        db.add(user_log)
        assistant_log = ConversationLog(
            session_id=session_id,
            role="assistant",
            message_text=reply_text,
            turn_index=turn_index + 1,
        )
        db.add(assistant_log)
        db.flush()

        db.add(SystemMetric(
            session_id=session_id,
            log_id=assistant_log.log_id,
            stt_latency_ms=stt_latency_ms,
            llm_latency_ms=0,
            tts_latency_ms=tts_res["latency_ms"],
            total_latency_ms=int((time.perf_counter() - overall_start) * 1000),
        ))
        db.commit()

        return VoiceTurnResponse(
            session_id=session_id,
            turn_index=turn_index + 1,
            user_transcript="(no speech detected)",
            user_message="(no speech detected)",
            reply_text=reply_text,
            reply=reply_text,
            audio_url=tts_res["audio_url"],
            audio_base64=tts_res["audio_base64"],
            audio_duration_ms=tts_res["audio_duration_ms"],
            visemes=[VisemeFrame(**v) for v in tts_res["visemes"]],
            stt_latency_ms=stt_latency_ms,
            llm_latency_ms=0,
            tts_latency_ms=tts_res["latency_ms"],
            total_latency_ms=int((time.perf_counter() - overall_start) * 1000),
        )

    # 3. Context & History
    turn_index = context_service.get_next_turn_index(db, session_id)
    history = context_service.get_recent_turns(db, session_id)
    kb_context = context_service.search_knowledge_base(db, user_transcript)

    # 4. Log user turn
    user_log = ConversationLog(
        session_id=session_id,
        role="user",
        message_text=user_transcript,
        turn_index=turn_index,
    )
    db.add(user_log)
    db.commit()

    # 5. LLM generation with Gemini
    contents = history + [{"role": "user", "parts": [{"text": user_transcript}]}]
    try:
        reply_text, llm_latency_ms = gemini_service.generate_reply(contents, kb_context)
    except Exception as exc:
        logger.exception("Gemini API error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}")

    # 6. TTS: Synthesize voice reply + viseme timeline
    try:
        tts_res = tts_service.synthesize(reply_text, voice=voice)
    except Exception as exc:
        logger.exception("TTS synthesis error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Text-to-speech error: {exc}")

    tts_latency_ms = tts_res["latency_ms"]
    audio_url = tts_res["audio_url"]
    audio_base64 = tts_res["audio_base64"]
    audio_duration_ms = tts_res["audio_duration_ms"]
    visemes = [VisemeFrame(**v) for v in tts_res["visemes"]]

    total_latency_ms = int((time.perf_counter() - overall_start) * 1000)

    # 7. Log assistant turn
    assistant_log = ConversationLog(
        session_id=session_id,
        role="assistant",
        message_text=reply_text,
        turn_index=turn_index + 1,
    )
    db.add(assistant_log)
    db.flush()

    # 8. Log full pipeline latency breakdown into MySQL system_metrics
    db.add(SystemMetric(
        session_id=session_id,
        log_id=assistant_log.log_id,
        stt_latency_ms=stt_latency_ms,
        llm_latency_ms=llm_latency_ms,
        tts_latency_ms=tts_latency_ms,
        total_latency_ms=total_latency_ms,
    ))
    db.add(ApiUsage(
        session_id=session_id,
        model_name=settings.gemini_model,
    ))
    db.commit()

    return VoiceTurnResponse(
        session_id=session_id,
        turn_index=turn_index + 1,
        user_transcript=user_transcript,
        user_message=user_transcript,
        reply_text=reply_text,
        reply=reply_text,
        audio_url=audio_url,
        audio_base64=audio_base64,
        audio_duration_ms=audio_duration_ms,
        visemes=visemes,
        stt_latency_ms=stt_latency_ms,
        llm_latency_ms=llm_latency_ms,
        tts_latency_ms=tts_latency_ms,
        total_latency_ms=total_latency_ms,
    )


@router.post("/stt", response_model=STTResponse)
async def stt_endpoint(
    file: UploadFile = File(...),
    language: str | None = Form(None),
):
    """Standalone Speech-to-Text endpoint. Upload an audio recording to transcribe."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    try:
        text, latency_ms, detected_lang = stt_service.transcribe_audio(audio_bytes, language=language)
        return STTResponse(text=text, language=detected_lang, latency_ms=latency_ms)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription error: {exc}")


@router.post("/tts", response_model=TTSResponse)
def tts_endpoint(payload: TTSRequest):
    """Standalone Text-to-Speech endpoint. Synthesizes voice audio and computes visemes for lip-sync."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        result = tts_service.synthesize(payload.text, voice=payload.voice)
        return TTSResponse(
            audio_url=result["audio_url"],
            audio_base64=result["audio_base64"],
            audio_duration_ms=result["audio_duration_ms"],
            visemes=[VisemeFrame(**v) for v in result["visemes"]],
            latency_ms=result["latency_ms"],
            engine=result["engine"],
            voice=result["voice"],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS synthesis error: {exc}")


@router.websocket("/ws/{session_id}")
async def websocket_chat_endpoint(websocket: WebSocket, session_id: str):
    """
    Real-time interactive voice & text WebSocket connection:
      Receives JSON message:
        {"type": "text", "message": "...", "synthesize_voice": true}
        OR
        {"type": "audio", "audio_base64": "..."}
      Emits JSON events:
        {"type": "user_transcription", "text": "..."}
        {"type": "llm_start"}
        {"type": "llm_reply", "text": "..."}
        {"type": "tts_ready", "audio_url": "...", "audio_base64": "...", "visemes": [...]}
    """
    await websocket.accept()
    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
        if not session or session.status != "active":
            await websocket.send_json({"type": "error", "message": "Active session not found"})
            await websocket.close()
            return

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "text")
            voice_choice = data.get("voice")

            user_text = ""
            stt_lat = 0

            if msg_type == "audio":
                raw_b64 = data.get("audio_base64", "")
                if "," in raw_b64:
                    raw_b64 = raw_b64.split(",", 1)[1]
                import base64 as b64_mod
                audio_bytes = b64_mod.b64decode(raw_b64)
                user_text, stt_lat, _ = stt_service.transcribe_audio(audio_bytes)
                await websocket.send_json({"type": "user_transcription", "text": user_text, "latency_ms": stt_lat})
            else:
                user_text = data.get("message", "").strip()

            if not user_text:
                continue

            # Process conversational turn
            turn_index = context_service.get_next_turn_index(db, session_id)
            history = context_service.get_recent_turns(db, session_id)
            kb_context = context_service.search_knowledge_base(db, user_text)

            # Log user
            db.add(ConversationLog(session_id=session_id, role="user", message_text=user_text, turn_index=turn_index))
            db.commit()

            await websocket.send_json({"type": "llm_start"})
            contents = history + [{"role": "user", "parts": [{"text": user_text}]}]

            # Stream LLM tokens
            collected_reply = []
            for token in gemini_service.generate_reply_stream(contents, kb_context):
                collected_reply.append(token)
                await websocket.send_json({"type": "llm_chunk", "token": token})

            full_reply = "".join(collected_reply).strip()
            await websocket.send_json({"type": "llm_reply", "text": full_reply})

            # TTS
            tts_res = tts_service.synthesize(full_reply, voice=voice_choice)
            await websocket.send_json({
                "type": "tts_ready",
                "audio_url": tts_res["audio_url"],
                "audio_base64": tts_res["audio_base64"],
                "audio_duration_ms": tts_res["audio_duration_ms"],
                "visemes": tts_res["visemes"],
                "latency_ms": tts_res["latency_ms"],
            })

            # Log assistant & metrics
            assistant_log = ConversationLog(session_id=session_id, role="assistant", message_text=full_reply, turn_index=turn_index + 1)
            db.add(assistant_log)
            db.flush()
            db.add(SystemMetric(
                session_id=session_id,
                log_id=assistant_log.log_id,
                stt_latency_ms=stt_lat or None,
                llm_latency_ms=0,
                tts_latency_ms=tts_res["latency_ms"],
            ))
            db.commit()

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    except Exception as ws_err:
        logger.error("WebSocket error: %s", ws_err)
    finally:
        db.close()

