$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$panel = Join-Path $root "module-panel"

adb push (Join-Path $panel "init.d-module-panel") /data/module-panel/init.d-module-panel
adb shell "chmod 755 /data/module-panel/init.d-module-panel; mkdir -p /data/module-panel/backups"
adb shell 'ts=$(date +%Y%m%d-%H%M%S); cp -a /etc/init.d/module-panel /data/module-panel/backups/module-panel.init.$ts 2>/dev/null || true; cp -a /etc/rc5.d/S99module-panel /data/module-panel/backups/S99module-panel.$ts 2>/dev/null || true; mount -o remount,rw /; cp /data/module-panel/init.d-module-panel /etc/init.d/module-panel; chmod 755 /etc/init.d/module-panel; ln -sf ../init.d/module-panel /etc/rc5.d/S99module-panel; sync; mount -o remount,ro /'
adb shell "ls -l /etc/init.d/module-panel /etc/rc5.d/S99module-panel; /etc/init.d/module-panel restart; sleep 1; ps | grep 'busybox httpd' | grep -v grep"

Write-Host "Autostart installed: /etc/rc5.d/S99module-panel -> ../init.d/module-panel"
