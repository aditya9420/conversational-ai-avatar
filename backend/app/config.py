from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # MySQL
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "avatar_app"
    mysql_password: str = "changeme"
    mysql_database: str = "ai_avatar"

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"

    # LiveKit
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # App
    app_env: str = "development"
    app_secret_key: str = "change_this_secret"
    context_turn_limit: int = 10

    # Speech Pipeline (STT / TTS)
    stt_model_size: str = "base"
    stt_device: str = "cpu"
    stt_compute_type: str = "int8"
    tts_engine: str = "edge-tts"  # 'edge-tts' or 'pyttsx3'
    tts_voice: str = "en-US-JennyNeural"
    tts_rate: str = "+0%"
    tts_pitch: str = "+0Hz"
    audio_output_dir: str = "static/audio"

    @property
    def sqlalchemy_database_uri(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )


settings = Settings()
