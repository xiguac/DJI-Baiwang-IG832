#!/bin/sh
set -eu
PATH=/sbin:/bin:/usr/sbin:/usr/bin

ROOT=/data/module-panel
WWW="$ROOT/www"
PIDFILE="$ROOT/httpd.pid"
SMSPIDFILE="$ROOT/sms-poller.pid"
LOG="$ROOT/panel.log"
PANEL_IP="${PANEL_IP:-192.168.225.1}"
BIND="${1:-$PANEL_IP:80}"

mkdir -p "$ROOT" "$WWW/cgi-bin"

wait_bridge() {
  i=0
  while [ "$i" -lt 45 ]; do
    if ip link show bridge0 >/dev/null 2>&1; then
      ip link set bridge0 up 2>/dev/null || true
      if ! ip addr show bridge0 2>/dev/null | grep -q "$PANEL_IP/"; then
        ip addr add "$PANEL_IP/24" dev bridge0 2>/dev/null || true
      fi
      ip addr show bridge0 2>/dev/null | grep -q "$PANEL_IP/" && return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  return 1
}

PANEL_DOMAIN="${PANEL_DOMAIN:-dji-celluar.com}"

ensure_panel_dhcp() {
  # Relaunch the module's DHCP (dnsmasq on bridge0) so it:
  #   1. hands out the module (192.168.225.1) as default gateway + DNS, so RNDIS
  #      clients reach the internet through the cellular link (rmnet NAT is set up).
  #   2. resolves the panel domain (dji-celluar.com) to the module, so the panel
  #      opens by name like a home router, not just by IP.
  # NOTE: this used to leave dnsmasq alone (return early) if it wasn't
  # running at all, on the assumption something else always starts it
  # before this runs. Confirmed false on 2026-09-28: after repeated
  # AT+CFUN=1,1-triggered reboots (see usbmode-auto.sh), dnsmasq was
  # found not running at all after a boot, and nothing else ever started
  # it - the panel/DHCP stayed dead until manually restarted. Always
  # (re)launch it now, whether it's absent or just missing our flags.
  running=""
  for pp in $(pidof dnsmasq 2>/dev/null); do
    running="$running $(tr '\0' ' ' < "/proc/$pp/cmdline" 2>/dev/null)"
  done
  case "$running" in
    *"$PANEL_DOMAIN"*) return 0 ;;  # already patched, nothing to do
  esac
  for pp in $(pidof dnsmasq 2>/dev/null); do kill "$pp" 2>/dev/null || true; done
  # The old dnsmasq can take several seconds to exit (observed 2026-10-24: a
  # fixed `sleep 1` let the new one start while port 53 was still held, it
  # died with "Address already in use" and the panel had no DHCP at all).
  # Wait for it to really be gone, then retry the start and log a failure.
  i=0
  while [ -n "$(pidof dnsmasq 2>/dev/null)" ] && [ "$i" -lt 15 ]; do
    sleep 1
    i=$((i + 1))
  done
  # Windows PCs (DHCP vendor class "MSFT 5.0") get no default gateway, so the
  # dev PC keeps using its own WiFi/ethernet; other clients (phones) still get
  # the module as gateway. Not matched by MAC: the PC's RNDIS MAC changes on
  # every USB re-enumeration.
  n=0
  while [ "$n" -lt 5 ]; do
    if dnsmasq -i bridge0 -I lo -z \
      --dhcp-range=bridge0,192.168.225.20,192.168.225.30,255.255.255.0,43200 \
      --dhcp-option-force=6,192.168.225.1 \
      --dhcp-option-force=120,abcd.com \
      --dhcp-vendorclass=set:nogw,MSFT \
      --dhcp-option=tag:nogw,3 \
      --address=/"$PANEL_DOMAIN"/192.168.225.1 >/dev/null 2>&1; then
      return 0
    fi
    n=$((n + 1))
    sleep 2
  done
  echo "$(date '+%F %T') ensure_panel_dhcp: dnsmasq failed to start after 5 attempts" >> "$LOG"
}

if [ ! -s "$ROOT/token" ]; then
  if [ -r /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid > "$ROOT/token"
  else
    date +%s | md5sum | awk '{print $1}' > "$ROOT/token"
  fi
  chmod 600 "$ROOT/token"
fi

cleanup_panel_httpd() {
  for pid in $(pidof httpd 2>/dev/null) $(pidof busybox 2>/dev/null); do
    cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    case "$cmdline" in
      *"busybox httpd"*module-panel*) kill "$pid" 2>/dev/null || true ;;
    esac
  done
}

start_usbmode_auto() {
  # This device is bus-powered - unplugging the USB cable cuts power
  # immediately, so every physical reconnection is a fresh boot. That means
  # usbmode-auto.sh only ever needs to run ONCE per boot (it tries the
  # last-good mode, falls back to the other one if no client shows up, then
  # exits) - it is NOT a persistent daemon, there is nothing to keep alive
  # or restart. setsid so it survives start.sh itself being invoked from an
  # interactive adb/ssh shell that later disconnects.
  setsid sh "$ROOT/usbmode-auto.sh" </dev/null >/dev/null 2>&1 &
}

start_pin_autounlock() {
  # One-shot, same reasoning as start_usbmode_auto: runs once per boot, not
  # a persistent daemon. No-ops immediately if no PIN has ever been saved.
  setsid sh "$ROOT/pin-autounlock.sh" </dev/null >/dev/null 2>&1 &
}

start_sms_poller() {
  if [ -s "$SMSPIDFILE" ] && kill -0 "$(cat "$SMSPIDFILE")" 2>/dev/null; then
    return 0
  fi
  # setsid: see the comment in start_usbmode_auto - same reasoning applies
  # here (this must survive an interactive shell disconnecting).
  setsid sh -c '
    sleep 5
    while true; do
      token="$(cat "$1/token" 2>/dev/null || true)"
      if [ -n "$token" ]; then
        wget -q -T 45 -O /dev/null "http://$2/cgi-bin/api?action=sms-sync&token=$token" >/dev/null 2>&1 || true
      fi
      sleep 30
    done
  ' _ "$ROOT" "$PANEL_IP" </dev/null >/dev/null 2>&1 &
  echo "$!" > "$SMSPIDFILE"
}

if [ -s "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "module-panel already running: pid $(cat "$PIDFILE")"
  echo "url: http://$BIND/"
  echo "token: $(cat "$ROOT/token")"
  exit 0
fi

for pid in $(pidof httpd 2>/dev/null) $(pidof busybox 2>/dev/null); do
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$cmdline" in
    *"busybox httpd -p $BIND -h $WWW"*)
      echo "$pid" > "$PIDFILE"
      echo "module-panel already running: pid $pid"
      echo "url: http://$PANEL_IP/"
      echo "token: $(cat "$ROOT/token")"
      exit 0
      ;;
  esac
done

cleanup_panel_httpd
rm -f "$PIDFILE"

if ! wait_bridge; then
  echo "$(date '+%F %T') bridge0 not ready for $PANEL_IP" >> "$LOG"
  exit 1
fi

ensure_panel_dhcp

if [ -s "$ROOT/dns.conf" ]; then
  awk '{print "nameserver " $1}' "$ROOT/dns.conf" > /etc/resolv.conf 2>/dev/null || true
fi

echo "$(date '+%F %T') starting module-panel on $BIND" >> "$LOG"
# -c: MIME type additions (busybox's built-in table serves .js/.svg/.woff2/...
# as application/octet-stream, which Chrome refuses to execute as an ES
# module script) - see httpd.conf next to this script.
busybox httpd -p "$BIND" -h "$WWW" -c "$ROOT/httpd.conf"
pid="$(ps | grep "busybox httpd -p $BIND -h $WWW" | grep -v grep | awk '{print $1}' | head -1)"
echo "$pid" > "$PIDFILE"
start_sms_poller
start_usbmode_auto
start_pin_autounlock

echo "module-panel started: pid $pid"
echo "url: http://$PANEL_IP/"
echo "token: $(cat "$ROOT/token")"
