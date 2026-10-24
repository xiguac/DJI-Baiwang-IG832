# Builds module-panel/frontend and copies the static output into
# module-panel/www/ (the tree that install.ps1 pushes to the device's
# /data/module-panel/www). Run this after editing anything under frontend/.
#
# Usage: powershell -File build-frontend.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root "frontend"
$www = Join-Path $root "www"
$cgiBin = Join-Path $www "cgi-bin"

Push-Location $frontend
try {
    npm install
    npm run build
} finally {
    Pop-Location
}

$dist = Join-Path $frontend "dist"
if (-not (Test-Path $dist)) {
    throw "build did not produce $dist"
}

# Preserve cgi-bin/ (the JSON backend script) - only the static SPA output
# under www/ gets replaced.
$cgiBinBackup = $null
if (Test-Path $cgiBin) {
    $cgiBinBackup = Join-Path $env:TEMP "module-panel-cgi-bin-backup"
    if (Test-Path $cgiBinBackup) { Remove-Item -Recurse -Force $cgiBinBackup }
    Copy-Item -Recurse -Force $cgiBin $cgiBinBackup
}

if (Test-Path $www) { Remove-Item -Recurse -Force $www }
New-Item -ItemType Directory -Force -Path $www | Out-Null
Copy-Item -Recurse -Force (Join-Path $dist "*") $www

if ($cgiBinBackup) {
    Copy-Item -Recurse -Force $cgiBinBackup $cgiBin
    Remove-Item -Recurse -Force $cgiBinBackup
}

Write-Host "Built frontend into $www (cgi-bin preserved)."
