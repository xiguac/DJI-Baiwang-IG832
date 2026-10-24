$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$panel = Join-Path $root "module-panel"

adb shell "mkdir -p /data/module-panel/www/cgi-bin"
adb push (Join-Path $panel "start.sh") /data/module-panel/start.sh
adb push (Join-Path $panel "stop.sh") /data/module-panel/stop.sh
adb push (Join-Path $panel "init.d-module-panel") /data/module-panel/init.d-module-panel
adb push (Join-Path $panel "httpd.conf") /data/module-panel/httpd.conf

# Whole built SPA tree (index.html, assets/, flags/, favicon.svg, theme-init.js)
# plus cgi-bin/ — run build-frontend.ps1 first if www/ is stale.
adb push (Join-Path $panel "www") /data/module-panel/

adb shell "chmod 755 /data/module-panel/start.sh /data/module-panel/stop.sh /data/module-panel/init.d-module-panel /data/module-panel/www/cgi-bin/api; /data/module-panel/start.sh"

Write-Host ""
Write-Host "Open:  http://192.168.225.1/  (or http://dji-celluar.com/ if that still resolves)"
Write-Host "Token: run 'adb shell cat /data/module-panel/token' if it was not printed above."
