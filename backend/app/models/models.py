import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, Integer, BigInteger, DateTime, Enum, Boolean,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    user_id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(150), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sessions = relationship("Session", back_populates="user", cascade="all, delete")


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    room_name = Column(String(150), nullable=True)
    status = Column(Enum("active", "ended", "error", name="session_status"), default="active")
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")
    logs = relationship("ConversationLog", back_populates="session", cascade="all, delete")
    metrics = relationship("SystemMetric", back_populates="session", cascade="all, delete")


class ConversationLog(Base):
    __tablename__ = "conversation_logs"

    log_id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum("user", "assistant", "system", name="log_role"), nullable=False)
    message_text = Column(Text, nullable=False)
    turn_index = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="logs")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    doc_id = Column(String(36), primary_key=True, default=gen_uuid)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    embedding_ref = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemMetric(Base):
    __tablename__ = "system_metrics"

    metric_id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    log_id = Column(BigInteger, ForeignKey("conversation_logs.log_id", ondelete="SET NULL"), nullable=True)
    stt_latency_ms = Column(Integer, nullable=True)
    llm_latency_ms = Column(Integer, nullable=True)
    tts_latency_ms = Column(Integer, nullable=True)
    total_latency_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="metrics")


class ApiUsage(Base):
    __tablename__ = "api_usage"

    usage_id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), default="gemini")
    model_name = Column(String(100), nullable=False)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
