"""
End-to-End Verification Test for Conversational AI Avatar Voice Pipeline:
1. Health check & voices endpoint
2. User & session creation in MySQL
3. TTS synthesis & viseme timeline validation
4. STT transcription of audio buffer
5. Full voice turn (/chat/voice): voice in -> STT -> context -> LLM -> TTS -> visemes out
6. Database verification: conversation logs & system_metrics (stt/llm/tts latencies)
"""
import io
import os
import sys
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models.models import User, Session as SessionModel, ConversationLog, SystemMetric, ApiUsage

client = TestClient(app)


def run_tests():
    print("=" * 60)
    print("  RUNNING VOICE CONVERSATION PIPELINE E2E TESTS")
    print("=" * 60)

    # 1. Health check
    res = client.get("/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print(" [1/6] Health check: PASSED")

    # 2. Get available voices
    res = client.get("/chat/voices")
    assert res.status_code == 200, f"Voices check failed: {res.text}"
    voices = res.json().get("voices", [])
    assert len(voices) > 0, "No voices returned"
    print(f" [2/6] Voices listing: PASSED ({len(voices)} voices available)")

    # 3. Create user & session
    res = client.post("/users/", json={
        "name": "Test Voice User",
        "email": f"voice_tester_{os.getpid()}@example.com",
        "password": "securepassword123",
    })
    assert res.status_code == 201, f"User creation failed: {res.text}"
    user_id = res.json()["user_id"]

    res = client.post("/sessions/", json={"user_id": user_id, "room_name": "test-room"})
    assert res.status_code == 201, f"Session creation failed: {res.text}"
    session_id = res.json()["session_id"]
    print(f" [3/6] User & Session created in MySQL: PASSED (session_id={session_id[:8]}...)")

    # 4. Standalone TTS synthesis & viseme validation
    test_phrase = "Hello! I am Modi Innovations conversational AI avatar."
    res = client.post("/chat/tts", json={"text": test_phrase, "voice": "en-US-JennyNeural"})
    assert res.status_code == 200, f"TTS endpoint failed: {res.text}"
    tts_data = res.json()
    assert tts_data["audio_url"].startswith("/static/audio/"), "Invalid audio_url"
    assert len(tts_data["visemes"]) > 0, "No visemes generated"
    assert tts_data["audio_duration_ms"] > 0, "Audio duration must be > 0"
    print(f" [4/6] TTS & Visemes Generation: PASSED")
    print(f"       -> Audio duration: {tts_data['audio_duration_ms']}ms, Visemes count: {len(tts_data['visemes'])}, Engine: {tts_data['engine']}")

    # 5. Standalone STT transcription using generated audio file
    generated_audio_file = os.path.join(".", tts_data["audio_url"].lstrip("/"))
    assert os.path.exists(generated_audio_file), f"Generated audio file missing: {generated_audio_file}"

    with open(generated_audio_file, "rb") as f:
        audio_content = f.read()

    res = client.post(
        "/chat/stt",
        files={"file": ("speech.mp3", io.BytesIO(audio_content), "audio/mp3")},
    )
    assert res.status_code == 200, f"STT endpoint failed: {res.text}"
    stt_data = res.json()
    print(f" [5/6] STT Transcription: PASSED")
    print(f"       -> Transcribed text: '{stt_data['text']}' (Latency: {stt_data['latency_ms']}ms)")

    # 6. Full Voice Conversational Turn (/chat/voice)
    res = client.post(
        "/chat/voice",
        data={"session_id": session_id, "voice": "en-US-JennyNeural"},
        files={"file": ("speech.mp3", io.BytesIO(audio_content), "audio/mp3")},
    )
    assert res.status_code == 200, f"/chat/voice endpoint failed: {res.text}"
    voice_turn = res.json()
    assert voice_turn["user_transcript"], "User transcript empty"
    assert voice_turn["reply_text"], "Reply text empty"
    assert voice_turn["audio_url"], "Avatar voice audio URL missing"
    assert len(voice_turn["visemes"]) > 0, "Avatar visemes missing"
    assert voice_turn["stt_latency_ms"] >= 0
    assert voice_turn["tts_latency_ms"] >= 0
    assert voice_turn["total_latency_ms"] >= 0

    print(f" [6/6] Full Voice Turn (Speech-in -> Speech-out): PASSED")
    print(f"       -> User said:      '{voice_turn['user_transcript']}'")
    print(f"       -> Avatar replied: '{voice_turn['reply_text'][:60]}...'")
    print(f"       -> Latencies: STT={voice_turn['stt_latency_ms']}ms | LLM={voice_turn['llm_latency_ms']}ms | TTS={voice_turn['tts_latency_ms']}ms | Total={voice_turn['total_latency_ms']}ms")
    print(f"       -> Avatar Visemes count: {len(voice_turn['visemes'])}")

    # 7. Verify MySQL persistence
    db = SessionLocal()
    try:
        logs = db.query(ConversationLog).filter(ConversationLog.session_id == session_id).all()
        assert len(logs) >= 2, f"Expected at least 2 conversation logs, found {len(logs)}"
        metrics = db.query(SystemMetric).filter(SystemMetric.session_id == session_id).all()
        assert len(metrics) >= 1, f"Expected system_metrics row, found {len(metrics)}"
        latest_metric = metrics[-1]
        print("=" * 60)
        print("  DATABASE PERSISTENCE VERIFICATION:")
        print(f"  * Total conversation turns stored: {len(logs)}")
        print(f"  * Latest MySQL Metric ID: {latest_metric.metric_id}")
        print(f"    - stt_latency_ms:   {latest_metric.stt_latency_ms} ms")
        print(f"    - llm_latency_ms:   {latest_metric.llm_latency_ms} ms")
        print(f"    - tts_latency_ms:   {latest_metric.tts_latency_ms} ms")
        print(f"    - total_latency_ms: {latest_metric.total_latency_ms} ms")
        print("=" * 60)
        print("  ALL TESTS PASSED SUCCESSFULLY!")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
