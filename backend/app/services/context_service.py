"""
Builds the conversational context sent to Gemini on each turn by pulling
recent conversation_logs (and optionally knowledge_base entries) from MySQL.
"""
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func, text

from app.models.models import ConversationLog, KnowledgeBase
from app.config import settings


def get_recent_turns(db: DBSession, session_id: str, limit: int | None = None) -> list[dict]:
    """Return the last N turns for a session, oldest first, in Gemini 'contents' shape."""
    limit = limit or settings.context_turn_limit

    rows = (
        db.query(ConversationLog)
        .filter(ConversationLog.session_id == session_id)
        .order_by(ConversationLog.turn_index.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()  # oldest -> newest

    role_map = {"user": "user", "assistant": "model", "system": "user"}
    return [
        {"role": role_map.get(r.role, "user"), "parts": [{"text": r.message_text}]}
        for r in rows
    ]


def get_next_turn_index(db: DBSession, session_id: str) -> int:
    max_turn = (
        db.query(func.max(ConversationLog.turn_index))
        .filter(ConversationLog.session_id == session_id)
        .scalar()
    )
    return (max_turn or 0) + 1


def search_knowledge_base(db: DBSession, query: str, limit: int = 3) -> list[str]:
    """Simple MySQL FULLTEXT search over knowledge_base for RAG-style context."""
    if not query.strip():
        return []
    rows = db.execute(
        text(
            "SELECT title, content FROM knowledge_base "
            "WHERE MATCH(title, content) AGAINST(:q IN NATURAL LANGUAGE MODE) "
            "LIMIT :lim"
        ),
        {"q": query, "lim": limit},
    ).all()
    return [f"{r.title}: {r.content[:800]}" for r in rows]
