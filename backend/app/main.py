from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routes import users, sessions, chat, team_api

app = FastAPI(
    title="Real-Time Conversational AI Avatar — Backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles

# Ensure static/audio directory exists
static_dir = Path(__file__).resolve().parent.parent / "static"
(static_dir / "audio").mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir), html=True), name="static")

app.include_router(users.router)
app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(team_api.router)



@app.on_event("startup")
def on_startup():
    # For dev convenience only — in production use Alembic migrations
    # against database/schema.sql instead of create_all().
    Base.metadata.create_all(bind=engine)

    # Warm up Whisper STT model in background thread so first user turn has 0 cold-start lag
    import threading
    from app.services import stt_service
    threading.Thread(target=stt_service._get_model, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok"}
