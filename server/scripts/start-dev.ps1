# Script para iniciar el servidor en desarrollo (Windows)
# Mata automaticamente procesos en los puertos necesarios

Write-Host "Buscando procesos en puertos 3001, 5000..." -ForegroundColor Cyan

# Funcion para matar proceso en un puerto
function Kill-Port {
    param($Port)

    $process = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

    if ($process) {
        Write-Host "Puerto $Port en uso por PID $process - Deteniendo..." -ForegroundColor Yellow
        Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Write-Host "Puerto $Port liberado" -ForegroundColor Green
    } else {
        Write-Host "Puerto $Port disponible" -ForegroundColor Gray
    }
}

# Matar procesos en los puertos usados (solo backend)
Kill-Port 3001
Kill-Port 5000

Write-Host ""
Write-Host "Iniciando servidor..." -ForegroundColor Green
Write-Host ""

# Iniciar el servidor
Set-Location $PSScriptRoot\..\..\
npx nodemon --watch server --exec npx tsx server/index.ts
