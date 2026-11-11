<#
.SYNOPSIS
    Starts both BillShield FastAPI backend (:8000) and Vite frontend (:5173).
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "Backend virtualenv missing at $venvPython. Run 'python -m venv venv' and install requirements.txt inside backend\."
}
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies in $frontendDir..."
    Push-Location $frontendDir
    npm install
    Pop-Location
}

Write-Host "Starting BillShield Backend on http://127.0.0.1:8000 ..."
$backendProc = Start-Process -FilePath $venvPython -ArgumentList "run.py" -WorkingDirectory $backendDir -PassThru

Write-Host "Starting BillShield Frontend on http://127.0.0.1:5173 ..."
try {
    Push-Location $frontendDir
    npm run dev
} finally {
    Pop-Location
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
}

