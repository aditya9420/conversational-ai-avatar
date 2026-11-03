@echo off
title Stop Conversational Avatar
cd /d "%~dp0"

echo ========================================================
echo        Stopping Conversational AI Avatar
echo ========================================================
echo.

echo [*] Terminating services running on port 8000 (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [*] Terminating services running on port 5173 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] All services have been stopped.
echo ========================================================
echo.
pause
