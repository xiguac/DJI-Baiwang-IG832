#!/bin/sh
ROOT=/data/module-panel
PIDFILE="$ROOT/httpd.pid"
SMSPIDFILE="$ROOT/sms-poller.pid"
stopped=0

if [ -s "$SMSPIDFILE" ] && kill -0 "$(cat "$SMSPIDFILE")" 2>/dev/null; then
  kill "$(cat "$SMSPIDFILE")" 2>/dev/null && stopped=1
fi
rm -f "$SMSPIDFILE"

# usbmode-auto.sh is intentionally NOT tracked/killed here - it's a one-shot
# boot-time script (this device is bus-powered, so a real unplug already
# cuts power; there is no persistent usbmode-auto process to stop).

if [ -s "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")"
  stopped=1
fi

for pid in $(pidof httpd 2>/dev/null) $(pidof busybox 2>/dev/null); do
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$cmdline" in
    *"busybox httpd"*module-panel*) kill "$pid" 2>/dev/null && stopped=1 ;;
  esac
done

rm -f "$PIDFILE"
if [ "$stopped" = 1 ]; then
  echo "module-panel stopped"
else
  echo "module-panel was not running"
fi
