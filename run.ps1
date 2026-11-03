# One-click startup script for Conversational Avatar (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       Starting Conversational AI Avatar" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check prerequisites
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed or not in PATH." -ForegroundColor Red
    pause
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js / npm is not installed or not in PATH." -ForegroundColor Red
    pause
    exit 1
}

# 2. Clean up any existing listeners on 8000 & 5173
Write-Host "[*] Freeing ports 8000 and 5173..." -ForegroundColor Gray
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# 3. Start Backend
Write-Host "[*] Launching Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$ScriptDir\backend`" && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

# 4. Start Frontend
Write-Host "[*] Launching Frontend on http://localhost:5173 ..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$ScriptDir\conversational-avatar-frontend`" && npm run dev"

# 5. Wait and Open Browser
Write-Host "[*] Waiting for services to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "[*] Opening browser to http://localhost:5173 ..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   Conversational Avatar is running!" -ForegroundColor Green
Write-Host "   - Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "   - Backend:  http://127.0.0.1:8000" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan
