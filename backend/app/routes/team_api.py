import time
import logging
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models.models import User, Session as SessionModel, ConversationLog, SystemMetric
from app.services import context_service, gemini_service, tts_service, stt_service

logger = logging.getLogger("team-api-router")

router = APIRouter(prefix="/api", tags=["team-frontend-compat"])

AVATAR_VOICES = {
    "eve": "en-US-JennyNeural",
    "steve": "en-US-GuyNeural",
}


class TeamChatRequest(BaseModel):
    message: str = ""
    avatar: str = "eve"
    session_id: str | None = None
    voice: str | None = None
    user_id: str | None = None


class TeamSpeakRequest(BaseModel):
    text: str = "Hello"
    avatar: str = "eve"
    voice: str | None = None


def _get_or_create_avatar_session(db: DBSession, avatar: str, user_id: str | None = None) -> SessionModel:
    """Finds or creates a session in MySQL for the avatar."""
    room_name = f"avatar-{avatar.lower()}-room"

    # If user_id provided, look up user
    user = None
    if user_id:
        user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        # Check or create default demo user
        user = db.query(User).filter(User.email == "demo@avatar.ai").first()
        if not user:
            user = User(name=f"{avatar.capitalize()} User", email="demo@avatar.ai", password_hash="demo")
            db.add(user)
            db.commit()
            db.refresh(user)

    new_session = SessionModel(user_id=user.user_id, room_name=room_name, status="active")
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.get("/health")
def api_health():
    """Health check endpoint matching frontend team's server.js specification."""
    return {
        "status": "online",
        "service": "Conversational Avatar Backend",
        "timestamp": datetime.utcnow().isoformat(),
        "endpoints": ["/api/health", "/api/chat", "/api/chat/voice", "/api/speak", "/api/avatar/status"],
    }


@router.get("/avatar/status")
def avatar_status():
    """Avatar status endpoint matching frontend team's server.js specification."""
    return {
        "status": "ready",
        "activeAvatar": "eve",
        "availableAvatars": ["eve", "steve"],
        "version": "1.0.0",
    }


@router.post("/chat")
def team_chat(payload: TeamChatRequest, db: DBSession = Depends(get_db)):
    """
    Main chat endpoint used by the frontend team (EvePage.jsx / StevePage.jsx).
    Compatible with frontend team's server.js mock API, but backed by real Gemini LLM,
    Edge-TTS voice synthesis, and MySQL conversation logging.
    """
    overall_start = time.perf_counter()
    avatar_name = (payload.avatar or "eve").lower()
    voice = payload.voice or AVATAR_VOICES.get(avatar_name, "en-US-JennyNeural")

    # 1. Resolve MySQL session
    if payload.session_id:
        session = db.query(SessionModel).filter(SessionModel.session_id == payload.session_id).first()
        if not session:
            session = _get_or_create_avatar_session(db, avatar_name, payload.user_id)
    else:
        session = _get_or_create_avatar_session(db, avatar_name, payload.user_id)

    session_id = session.session_id
    turn_index = context_service.get_next_turn_index(db, session_id)
    history = context_service.get_recent_turns(db, session_id)

    # 2. Log user turn
    user_msg = payload.message.strip() or f"Hello {avatar_name.capitalize()}"
    user_log = ConversationLog(
        session_id=session_id,
        role="user",
        message_text=user_msg,
        turn_index=turn_index,
    )
    db.add(user_log)
    db.commit()

    # 3. Call Gemini LLM
    llm_start = time.perf_counter()
    contents = history + [{"role": "user", "parts": [{"text": user_msg}]}]
    try:
        reply_text, llm_latency_ms = gemini_service.generate_reply(contents)
    except Exception as exc:
        logger.warning("Gemini generation fallback: %s", exc)
        reply_text = f"Hello! I am {avatar_name.capitalize()}. Great to connect with you!"
        llm_latency_ms = int((time.perf_counter() - llm_start) * 1000)

    # 4. Synthesize Voice + Visemes
    tts_start = time.perf_counter()
    tts_res = tts_service.synthesize(reply_text, voice=voice)
    tts_latency_ms = int((time.perf_counter() - tts_start) * 1000)
    total_latency_ms = int((time.perf_counter() - overall_start) * 1000)

    # 5. Log Assistant Turn + System Metrics
    asst_log = ConversationLog(
        session_id=session_id,
        role="assistant",
        message_text=reply_text,
        turn_index=turn_index + 1,
    )
    db.add(asst_log)

    metric = SystemMetric(
        session_id=session_id,
        stt_latency_ms=0,
        llm_latency_ms=llm_latency_ms,
        tts_latency_ms=tts_latency_ms,
        total_latency_ms=total_latency_ms,
    )
    db.add(metric)
    db.commit()

    duration_ms = tts_res.get("audio_duration_ms") or tts_res.get("duration_ms") or max(2500, len(reply_text) * 75)

    return {
        "avatar": avatar_name,
        "userMessage": user_msg,
        "user_transcript": user_msg,
        "reply": reply_text,
        "reply_text": reply_text,
        "durationMs": duration_ms,
        "audio_duration_ms": duration_ms,
        "audio_url": tts_res.get("audio_url"),
        "audio_base64": tts_res.get("audio_base64"),
        "visemes": tts_res.get("visemes", []),
        "mouthFrames": [1, 2, 3, 2, 1, 0],
        "session_id": session_id,
        "llm_latency_ms": llm_latency_ms,
        "tts_latency_ms": tts_latency_ms,
        "total_latency_ms": total_latency_ms,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/chat/voice")
async def team_chat_voice(
    file: UploadFile = File(...),
    avatar: str = Form("eve"),
    session_id: str | None = Form(None),
    voice: str | None = Form(None),
    user_id: str | None = Form(None),
    db: DBSession = Depends(get_db),
):
    """
    Speech-to-Speech conversational turn endpoint for frontend push-to-talk.
    Transcribes user audio -> Gemini -> Neural TTS + Visemes -> MySQL telemetry.
    """
    overall_start = time.perf_counter()
    avatar_name = (avatar or "eve").lower()
    selected_voice = voice or AVATAR_VOICES.get(avatar_name, "en-US-JennyNeural")

    # 1. Resolve session
    if session_id:
        session = db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
        if not session:
            session = _get_or_create_avatar_session(db, avatar_name, user_id)
    else:
        session = _get_or_create_avatar_session(db, avatar_name, user_id)

    session_id = session.session_id

    # 2. Transcribe voice input with STT
    audio_bytes = await file.read()
    user_transcript, stt_latency_ms, _ = stt_service.transcribe_audio(audio_bytes)
    user_msg = user_transcript.strip()

    if not user_msg:
        logger.info("Empty speech transcript received for avatar %s (latency=%dms)", avatar_name, stt_latency_ms)
        return {
            "avatar": avatar_name,
            "userMessage": "",
            "user_transcript": "",
            "reply": "",
            "reply_text": "",
            "empty": True,
            "durationMs": 0,
            "audio_duration_ms": 0,
            "audio_url": None,
            "audio_base64": None,
            "visemes": [],
            "mouthFrames": [0],
            "session_id": session_id,
            "stt_latency_ms": stt_latency_ms,
            "llm_latency_ms": 0,
            "tts_latency_ms": 0,
            "total_latency_ms": int((time.perf_counter() - overall_start) * 1000),
            "timestamp": datetime.utcnow().isoformat(),
        }

    # 3. Log user turn
    turn_index = context_service.get_next_turn_index(db, session_id)
    history = context_service.get_recent_turns(db, session_id)
    user_log = ConversationLog(
        session_id=session_id,
        role="user",
        message_text=user_msg,
        turn_index=turn_index,
    )
    db.add(user_log)
    db.commit()

    # 4. Gemini reply
    llm_start = time.perf_counter()
    contents = history + [{"role": "user", "parts": [{"text": user_msg}]}]
    try:
        reply_text, llm_latency_ms = gemini_service.generate_reply(contents)
    except Exception as exc:
        logger.warning("Gemini voice generation fallback: %s", exc)
        reply_text = f"Hello! I am {avatar_name.capitalize()}. Great to connect with you!"
        llm_latency_ms = int((time.perf_counter() - llm_start) * 1000)

    # 5. Synthesize TTS
    tts_start = time.perf_counter()
    tts_res = tts_service.synthesize(reply_text, voice=selected_voice)
    tts_latency_ms = int((time.perf_counter() - tts_start) * 1000)
    total_latency_ms = int((time.perf_counter() - overall_start) * 1000)

    # 6. Log Assistant turn & metrics
    asst_log = ConversationLog(
        session_id=session_id,
        role="assistant",
        message_text=reply_text,
        turn_index=turn_index + 1,
    )
    db.add(asst_log)
    metric = SystemMetric(
        session_id=session_id,
        stt_latency_ms=stt_latency_ms,
        llm_latency_ms=llm_latency_ms,
        tts_latency_ms=tts_latency_ms,
        total_latency_ms=total_latency_ms,
    )
    db.add(metric)
    db.commit()

    duration_ms = tts_res.get("audio_duration_ms") or tts_res.get("duration_ms") or max(2500, len(reply_text) * 75)

    return {
        "avatar": avatar_name,
        "userMessage": user_msg,
        "user_transcript": user_msg,
        "reply": reply_text,
        "reply_text": reply_text,
        "durationMs": duration_ms,
        "audio_duration_ms": duration_ms,
        "audio_url": tts_res.get("audio_url"),
        "audio_base64": tts_res.get("audio_base64"),
        "visemes": tts_res.get("visemes", []),
        "mouthFrames": [1, 2, 3, 2, 1, 0],
        "session_id": session_id,
        "stt_latency_ms": stt_latency_ms,
        "llm_latency_ms": llm_latency_ms,
        "tts_latency_ms": tts_latency_ms,
        "total_latency_ms": total_latency_ms,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/speak")
def team_speak(payload: TeamSpeakRequest):
    """
    Dedicated speech trigger endpoint matching frontend team's server.js specification.
    Returns real audio URL and calculated duration.
    """
    avatar_name = (payload.avatar or "eve").lower()
    voice = payload.voice or AVATAR_VOICES.get(avatar_name, "en-US-JennyNeural")

    tts_res = tts_service.synthesize(payload.text, voice=voice)
    duration_ms = tts_res.get("audio_duration_ms") or tts_res.get("duration_ms") or max(1500, len(payload.text) * 80)

    return {
        "status": "speaking",
        "text": payload.text,
        "durationMs": duration_ms,
        "audio_duration_ms": duration_ms,
        "audio_url": tts_res.get("audio_url"),
        "audio_base64": tts_res.get("audio_base64"),
        "visemes": tts_res.get("visemes", []),
        "mouthFrames": [1, 2, 3, 2, 1, 0],
    }
