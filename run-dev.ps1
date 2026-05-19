# FDM Tracker — local dev launcher (no Docker required).
# Starts the backend API and the admin web app, each in its own
# PowerShell window. Run from anywhere:  powershell -File D:\FDM\run-dev.ps1
# Stop everything by closing the two spawned windows (or Ctrl+C in each).

$ErrorActionPreference = "Stop"
$root      = $PSScriptRoot
$backend   = Join-Path $root "backend"
$admin     = Join-Path $root "admin"
$python    = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Backend venv not found at $python" -ForegroundColor Red
    Write-Host "Create it first:  cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt"
    exit 1
}
if (-not (Test-Path (Join-Path $admin "node_modules"))) {
    Write-Host "Admin deps missing — installing (one-time)..." -ForegroundColor Yellow
    Push-Location $admin; npm install; Pop-Location
}

# Backend API -> http://127.0.0.1:8000
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$backend'; & '$python' -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
)

# Admin web -> http://localhost:3000
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$admin'; npm run dev"
)

Write-Host ""
Write-Host "FDM Tracker starting..." -ForegroundColor Green
Write-Host "  Admin UI : http://localhost:3000"
Write-Host "  API      : http://127.0.0.1:8000"
Write-Host ""
Write-Host "Two PowerShell windows opened (backend + admin). Give them ~10s,"
Write-Host "then open http://localhost:3000 and sign in as digital@fourdm.com."
