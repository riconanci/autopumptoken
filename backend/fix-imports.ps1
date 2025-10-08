# Fix Import Paths Script
Write-Host "Fixing import paths..." -ForegroundColor Cyan

$files = @(
    "src\services\feeMonitor.ts",
    "src\services\buyback.ts",
    "src\services\burn.ts",
    "src\routes\admin.ts",
    "src\routes\claim.ts",
    "src\routes\stats.ts"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Fixing $file..." -ForegroundColor Yellow
        
        $content = Get-Content $file -Raw
        $content = $content -replace "from '\.\./\.\./\.\./src/types'", "from '../types'"
        $content = $content -replace 'from "\.\./\.\./\.\./src/types"', 'from "../types"'
        
        Set-Content $file $content -NoNewline
        
        Write-Host "  Fixed" -ForegroundColor Green
    } else {
        Write-Host "  File not found: $file" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "All imports fixed!" -ForegroundColor Green
Write-Host "Now run: npm run dev" -ForegroundColor Cyan