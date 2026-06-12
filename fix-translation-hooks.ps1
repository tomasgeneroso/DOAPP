# Script para arreglar hooks useTranslation en archivos TSX

$files = @(
    "client/components/ui/LocationAutocomplete.tsx",
    "client/components/ui/NeighborhoodAutocomplete.tsx",
    "client/hooks/usePerformance.tsx",
    "client/pages/QuoteForm.tsx",
    "client/pages/admin/AnalyticsUserActivity.tsx",
    "client/pages/admin/TicketDetail.tsx",
    "client/pages/legal/CookiesPolicy.tsx",
    "client/pages/legal/DisputeResolution.tsx",
    "client/pages/legal/PrivacyPolicy.tsx"
)

foreach ($file in $files) {
    $fullPath = Join-Path (Get-Location) $file
    if (Test-Path $fullPath) {
        Write-Host "Procesando: $file"

        # Leer el contenido
        $content = Get-Content $fullPath -Raw

        # Buscar patrones problemáticos y arreglarlos
        # Patrón 1: "const { t } = useTranslation();" dentro de JSX después de "return ("
        $content = $content -replace '(?<=return\s*\(\r?\n)\s*const\s*{\s*t\s*}\s*=\s*useTranslation\(\);?\s*', ''

        # Patrón 2: "const { t } = useTranslation();" dentro de objeto o declaración
        $content = $content -replace '(\s*)\s*const\s*{\s*t\s*}\s*=\s*useTranslation\(\);?(\s+)(?=[a-zA-Z].*:\s*["\{])', "`$1// Moved to top`$2"

        # Escribir el contenido corregido
        Set-Content -Path $fullPath -Value $content -Encoding UTF8
        Write-Host "  ✓ Arreglado"
    } else {
        Write-Host "✗ No encontrado: $file"
    }
}

Write-Host "`nScript completado"
