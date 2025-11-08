# PowerShell Script to Kill Ports and All Development Processes
# More aggressive than the TypeScript version

param(
    [int[]]$Ports = @(5000, 5173),
    [switch]$All = $false
)

Write-Host "==== LIMPIEZA COMPLETA DE PUERTOS Y PROCESOS ====`n" -ForegroundColor Cyan

# Function to kill processes by name
function Kill-ProcessesByName {
    param([string[]]$ProcessNames)

    $killed = 0
    foreach ($name in $ProcessNames) {
        try {
            $processes = Get-Process -Name $name -ErrorAction SilentlyContinue
            if ($processes) {
                foreach ($proc in $processes) {
                    try {
                        Write-Host "[KILL] Matando $name (PID: $($proc.Id))..." -ForegroundColor Yellow
                        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                        $killed++
                    } catch {
                        Write-Host "[WARN] No se pudo matar PID $($proc.Id)" -ForegroundColor Red
                    }
                }
            }
        } catch {
            # Process not found, continue
        }
    }

    if ($killed -gt 0) {
        Write-Host "[OK] $killed procesos terminados`n" -ForegroundColor Green
    } else {
        Write-Host "[OK] No hay procesos adicionales de desarrollo`n" -ForegroundColor Green
    }
}

# Function to kill processes on specific port
function Kill-Port {
    param([int]$Port)

    Write-Host "[SEARCH] Buscando procesos en puerto $Port..." -ForegroundColor Cyan

    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue

        if (-not $connections) {
            Write-Host "[OK] Puerto $Port esta libre`n" -ForegroundColor Green
            return
        }

        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

        Write-Host "[FOUND] Encontrados $($pids.Count) procesos en puerto ${Port}: $($pids -join ', ')" -ForegroundColor Yellow

        foreach ($pid in $pids) {
            try {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "[KILL] Matando proceso $($proc.Name) (PID: $pid)..." -ForegroundColor Yellow
                    Stop-Process -Id $pid -Force -ErrorAction Stop
                    Write-Host "[OK] Proceso $pid terminado" -ForegroundColor Green
                }
            } catch {
                Write-Host "[WARN] No se pudo terminar proceso $pid" -ForegroundColor Red
            }
        }

        # Wait and verify
        Start-Sleep -Seconds 2

        $stillOpen = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($stillOpen) {
            Write-Host "[WARN] Puerto $Port aun esta ocupado`n" -ForegroundColor Red
        } else {
            Write-Host "[OK] Puerto $Port liberado correctamente`n" -ForegroundColor Green
        }

    } catch {
        Write-Host "[OK] Puerto $Port esta libre`n" -ForegroundColor Green
    }
}

# PASO 1: Liberar puertos especificos
Write-Host "PASO 1: Liberando puertos especificos`n" -ForegroundColor Magenta
foreach ($port in $Ports) {
    Kill-Port -Port $port
}

# PASO 2: Verificación de procesos específicos en puertos
Write-Host "PASO 2: Verificando procesos especificos de DOAPP`n" -ForegroundColor Magenta

# Solo matamos procesos específicamente en los puertos de desarrollo de DOAPP
# NO matamos todos los procesos node/tsx para no afectar Claude Code u otros servicios

$doappProcesses = @()
foreach ($port in $Ports) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            $doappProcesses += $pids
        }
    } catch {
        # Puerto libre
    }
}

if ($doappProcesses.Count -eq 0) {
    Write-Host "[OK] No hay procesos de DOAPP ejecutandose`n" -ForegroundColor Green
} else {
    Write-Host "[INFO] Solo limpiando procesos en puertos $($Ports -join ', ')`n" -ForegroundColor Cyan
}

# PASO 3: Verificacion final
Write-Host "PASO 3: Verificacion final`n" -ForegroundColor Magenta

foreach ($port in $Ports) {
    try {
        $check = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($check) {
            Write-Host "[ERROR] Puerto $port SIGUE OCUPADO" -ForegroundColor Red
        } else {
            Write-Host "[OK] Puerto $port confirmado libre" -ForegroundColor Green
        }
    } catch {
        Write-Host "[OK] Puerto $port confirmado libre" -ForegroundColor Green
    }
}

Write-Host "`n==== LIMPIEZA COMPLETA FINALIZADA ====`n" -ForegroundColor Green

# Exit with success code
exit 0
