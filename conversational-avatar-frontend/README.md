# Conversational AI Avatar — Unified Project

Modi Innovations' AI Avatar project. This repository contains both the frontend (React + Vite) and the backend (FastAPI + MySQL + Gemini API + LiveKit).

## 1. Project Structure

```
conversational-avatar/
  public/              Frontend public assets (avatars, lineart)
  src/                 React components, routing, pages
  backend/             FastAPI application
    app/
      main.py          REST API: users, sessions, chat
      agent.py         LiveKit voice pipeline
      models/models.py ORM models (mirrors database/schema.sql)
      routes/          REST endpoints (users, sessions, chat)
  database/
    schema.sql         Full MySQL schema
    seed.sql           Sample knowledge base data
```

## 2. Running Frontend
```bash
npm install
npm run dev
```

## 3. Running Backend
```bash
cd backend
python -m venv venv
source venv/Scripts/activate # On Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```
