# Fixes Windows "Select an app to open 'cbm-*'" spam from codebase-memory-mcp hooks (Claude Code / Cursor).
# Run once:  powershell -ExecutionPolicy Bypass -File scripts/fix-cbm-windows.ps1
#
# 1) Registers cbm-* URL schemes to Cursor so Windows stops showing the picker.
# 2) Optionally re-runs `codebase-memory-mcp install -y` to rewrite hooks for Windows (recommended).

$ErrorActionPreference = "Stop"

function Find-CursorExe {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\cursor\Cursor.exe"),
        (Join-Path ${env:ProgramFiles} "Cursor\Cursor.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Cursor\Cursor.exe")
    )
    foreach ($p in $candidates) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    $cmd = Get-Command cursor -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) { return $cmd.Source }
    return $null
}

function Register-UrlProtocol {
    param(
        [Parameter(Mandatory = $true)][string] $Scheme,
        [Parameter(Mandatory = $true)][string] $CursorExe
    )
    $root = "Registry::HKEY_CURRENT_USER\Software\Classes\$Scheme"
    New-Item -Path $root -Force | Out-Null
    Set-ItemProperty -Path $root -Name "(default)" -Value "URL:$Scheme"
    New-ItemProperty -Path $root -Name "URL Protocol" -PropertyType String -Value "" -Force | Out-Null

    $cmdPath = Join-Path $root "shell\open\command"
    New-Item -Path $cmdPath -Force | Out-Null
    $invoke = "`"$CursorExe`" `"%1`""
    Set-ItemProperty -Path $cmdPath -Name "(default)" -Value $invoke
}

$cursor = Find-CursorExe
if (-not $cursor) {
    Write-Error "Cursor.exe not found. Install Cursor or edit Find-CursorExe in this script."
}

Write-Host "Using Cursor: $cursor" -ForegroundColor Cyan

$schemes = @(
    "cbm-code-discovery-gate",
    "cbm-session-reminder",
    "cbm-session-start"
)

foreach ($s in $schemes) {
    Register-UrlProtocol -Scheme $s -CursorExe $cursor
    Write-Host "Registered URL scheme: $s"
}

Write-Host ""
Write-Host "Protocol registration done. Dialogs for these schemes should stop." -ForegroundColor Green

$cbm = Join-Path $env:LOCALAPPDATA "Programs\codebase-memory-mcp\codebase-memory-mcp.exe"
if (Test-Path -LiteralPath $cbm) {
    Write-Host ""
    Write-Host "Re-running agent configuration (rewrites hooks for Windows)..." -ForegroundColor Cyan
    & $cbm install -y
    Write-Host "codebase-memory-mcp install finished." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Optional: install or re-run codebase-memory-mcp so hooks are Windows-native:" -ForegroundColor Yellow
    Write-Host "  irm https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 | iex"
    Write-Host "  # then restart Cursor"
}

Write-Host ""
Write-Host "Restart Cursor for hook changes to take effect." -ForegroundColor Cyan
