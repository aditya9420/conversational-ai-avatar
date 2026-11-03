from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    user_id: str
    name: str
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True


class SessionCreate(BaseModel):
    user_id: str
    room_name: str | None = None


class SessionOut(BaseModel):
    session_id: str
    user_id: str
    status: str
    started_at: datetime

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    session_id: str
    message: str
    synthesize_voice: bool = False
    voice: str | None = None


class VisemeFrame(BaseModel):
    time_ms: int
    duration_ms: int
    shape: str
    shape_legacy: str | None = None
    weight: float = 1.0


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    turn_index: int
    llm_latency_ms: int
    audio_url: str | None = None
    audio_base64: str | None = None
    audio_duration_ms: int | None = None
    visemes: list[VisemeFrame] | None = None
    tts_latency_ms: int | None = None
    total_latency_ms: int | None = None


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    session_id: str | None = None


class TTSResponse(BaseModel):
    audio_url: str
    audio_base64: str | None = None
    audio_duration_ms: int
    visemes: list[VisemeFrame]
    latency_ms: int
    engine: str
    voice: str


class STTResponse(BaseModel):
    text: str
    language: str
    latency_ms: int


class VoiceTurnResponse(BaseModel):
    session_id: str
    turn_index: int
    user_transcript: str
    user_message: str | None = None
    reply_text: str
    reply: str | None = None
    audio_url: str
    audio_base64: str | None = None
    audio_duration_ms: int
    visemes: list[VisemeFrame]
    stt_latency_ms: int
    llm_latency_ms: int
    tts_latency_ms: int
    total_latency_ms: int

