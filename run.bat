@echo off
title Conversational Avatar Launcher
cd /d "%~dp0"

echo ========================================================
echo        Starting Conversational AI Avatar
echo ========================================================
echo.

REM 1. Verify Prerequisites
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in your PATH.
    echo Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js / npm is not found in your PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Free up port 8000 or 5173 if previously stuck
echo [*] Checking and freeing ports 8000 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [*] Launching FastAPI Backend on http://127.0.0.1:8000 ...
start "Conversational Avatar - Backend" cmd /k "cd /d "%~dp0backend" && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo [*] Launching Vite Frontend on http://localhost:5173 ...
start "Conversational Avatar - Frontend" cmd /k "cd /d "%~dp0conversational-avatar-frontend" && npm run dev"

echo.
echo [*] Waiting for services to initialize...
timeout /t 3 /nobreak >nul

echo [*] Opening application in your default web browser...
start http://localhost:5173

echo.
echo ========================================================
echo    Conversational Avatar is running!
echo    - Frontend: http://localhost:5173
echo    - Backend:  http://127.0.0.1:8000
echo.
echo    To stop both servers, double-click stop.bat or close
echo    the Backend and Frontend terminal windows.
echo ========================================================
echo.
pause
