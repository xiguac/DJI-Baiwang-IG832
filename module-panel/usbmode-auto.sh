#!/bin/sh
# usbmode-auto.sh - USB network mode negotiation.
#
# CRITICAL HARDWARE FACT (confirmed 2026-09-28 via /proc/uptime, isolated
# test): applying a USB composition change - AT+QCFG="usbnet",X followed by
# AT+CFUN=1,1 - causes a FULL LINUX REBOOT on this firmware, not just a
# radio/USB-only reset as earlier testing had assumed. This matches Quectel's
# documented AT+CFUN=<fun>,<rst> semantics: rst=1 means "reset before
# applying", and on this module that reset is a real reboot. Verified
# directly: sending bare AT+CFUN=1,1 with NO mode change dropped
# /proc/uptime from ~147s to ~18s about 15s later, and adb dropped out
# entirely during it.
#
# CONSEQUENCE FOR THIS SCRIPT: whichever invocation actually ISSUES a mode
# switch gets killed by the reboot within a few seconds - it never lives
# long enough to sleep-and-then-check for host activity in the same run.
# All negotiation state MUST live on real flash ($ROOT), never /tmp
# (tmpfs) - /tmp is wiped on every reboot, self-triggered or not, so it
# can never survive across the very switch it's meant to be tracking. This
# was the actual bug in the previous (v3) design: it tracked "already tried
# this boot" in /tmp on the assumption that a mode-switch only caused a
# brief USB re-enumeration while Linux stayed up - so /tmp always came back
# empty and the script kept re-guessing the same first candidate forever.
#
# ALSO: this module is bus-powered (confirmed by the user) - a genuine cable
# unplug is likewise a full reboot, indistinguishable at the OS level from
# a self-triggered one. usbmode.negotiation (below) is only ever alive
# WHILE a negotiation is actively in progress - cleared the instant it
# concludes (success or exhausted) - so a later real replug, which happens
# well after any prior negotiation already concluded, naturally starts a
# fresh negotiation instead of remembering a stale one.
#
# DESIGN: every invocation does AT MOST one of: (a) confirm the currently
# configured mode already has host traffic -> conclude, or (b) switch to
# the next untried candidate -> this process dies in the reboot, and the
# NEXT boot's invocation (start.sh runs this script on every boot the same
# way it always has) picks up from usbmode.negotiation and continues.
#
# ECM is tried first, unconditionally, on every fresh negotiation (phones
# need it and PCs tolerate it fine) - falling back to RNDIS only if ECM
# produces no host traffic. This is a explicit user requirement, not an
# adaptive "last known good" guess.

IFACE_WAIT=10   # seconds to wait for rndis0/ecm0 to exist after boot
CHECK_WAIT=15   # seconds to watch for host rx activity once the iface exists
API_WAIT=20     # seconds to wait for the panel API to answer after boot

ROOT=/data/module-panel
DISABLE_FLAG="$ROOT/usbmode-auto.disable"
STATE_FILE="$ROOT/usbmode.state"             # last mode confirmed working (persists across boots - informational only)
NEG_FILE="$ROOT/usbmode.negotiation"         # modes already tried THIS negotiation - real flash, survives the self-triggered reboots of one negotiation, cleared on conclusion
LOG="$ROOT/usbmode.log"
DIAG_LOG="$ROOT/usbmode-diag.log"
PANEL_IP="${PANEL_IP:-192.168.225.1}"

RUNNING_LOCK="/tmp/usbmode_auto.running"

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

if [ -f "$DISABLE_FLAG" ]; then
  log "usbmode-auto disabled (found $DISABLE_FLAG) - leaving USB mode untouched"
  exit 0
fi

# Short mutex just to stop two invocations racing at the exact same instant.
# A stale lock (owning process already dead) is not respected.
if [ -f "$RUNNING_LOCK" ]; then
  owner="$(cat "$RUNNING_LOCK" 2>/dev/null)"
  if [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null; then
    log "another usbmode-auto instance (pid $owner) is already running - skipping"
    exit 0
  fi
fi
echo "$$" > "$RUNNING_LOCK"
trap 'rm -f "$RUNNING_LOCK"' EXIT

api_call() {
  token="$(cat "$ROOT/token" 2>/dev/null)"
  [ -n "$token" ] || return 1
  wget -q -T 25 -O - "http://$PANEL_IP/cgi-bin/api?action=$1&token=$token" 2>/dev/null
}

# Wait for the panel API to actually answer - it starts later in start.sh's
# own sequence, and this script can be reached before that finishes.
wait_for_api() {
  i=0
  while [ "$i" -lt "$API_WAIT" ]; do
    api_call 'usbnet-query' | grep -q '"mode"' && return 0
    i=$((i + 1))
    sleep 1
  done
  return 1
}

active_iface() {
  for ifc in rndis0 ecm0; do
    [ -d "/sys/class/net/$ifc" ] && { echo "$ifc"; return 0; }
  done
  return 1
}

wait_for_iface() {
  i=0
  while [ "$i" -lt "$IFACE_WAIT" ]; do
    ifc="$(active_iface)" && { echo "$ifc"; return 0; }
    i=$((i + 1))
    sleep 1
  done
  return 1
}

rx_packets_now() {
  cat "/sys/class/net/$1/statistics/rx_packets" 2>/dev/null
}

# True if the host has sent ANY frame at all since we started watching -
# i.e. it has a real driver for whatever protocol is currently active on
# $1, regardless of whether IP/DHCP has finished configuring yet. Confirmed
# by direct testing: a Windows PC on rndis0 shows >0 rx_packets within 5s;
# a mode the host doesn't support stays at exactly 0 indefinitely.
wait_for_host_activity() {
  ifc="$1"
  i=0
  while [ "$i" -lt "$CHECK_WAIT" ]; do
    now="$(rx_packets_now "$ifc")"
    [ -n "$now" ] || now=0
    [ "$now" -gt 0 ] && return 0
    i=$((i + 1))
    sleep 1
  done
  return 1
}

current_target_mode() {
  api_call usbnet-query | sed -n 's/.*"mode":"\([a-z]*\)".*/\1/p'
}

already_tried() {
  [ -f "$NEG_FILE" ] && grep -qx "$1" "$NEG_FILE" 2>/dev/null
}
mark_tried() {
  echo "$1" >> "$NEG_FILE"
}

# One-shot snapshot of bridge/ARP/routing state, taken whenever host
# activity is confirmed. This device is bus-powered with a single USB port,
# so it can never be attached to a phone and to this dev PC at the same
# time - this is the only way to capture what the bridge/ARP table actually
# looked like during a real phone session (e.g. iPhone gets an IP over ECM
# but can't reach 192.168.225.1) for later inspection over adb.
dump_diag() {
  ifc="$1"; mode="$2"
  [ -f "$DIAG_LOG" ] && [ "$(wc -c < "$DIAG_LOG" 2>/dev/null || echo 0)" -gt 102400 ] && : > "$DIAG_LOG"
  {
    echo "=== diag $(date '+%F %T') mode=$mode ifc=$ifc ==="
    echo "-- ip addr $ifc --"; ip addr show "$ifc" 2>&1
    echo "-- ip addr bridge0 --"; ip addr show bridge0 2>&1
    echo "-- brctl show --"; brctl show 2>&1
    echo "-- ip route --"; ip route 2>&1
    echo "-- arp --"; cat /proc/net/arp 2>&1
    echo "-- iptables filter --"; iptables -L -n -v 2>&1
    echo "-- iptables nat --"; iptables -t nat -L -n -v 2>&1
    echo "=== end diag ==="
  } >> "$DIAG_LOG" 2>&1
}

# Switches to $1 if it isn't already the configured mode. Returns 0 (and
# marks it tried) if a real switch was issued - the caller should assume
# this process is about to be killed by the resulting reboot. Returns 1 if
# $1 was already the configured mode - no reboot happens, execution
# continues in this same invocation.
switch_to() {
  mode="$1"
  resp="$(api_call "usbnet-set&mode=$mode")"
  case "$resp" in
    *'"changed":true'*)
      mark_tried "$mode"
      log "switching to mode=$mode (this will reboot the device)"
      return 0
      ;;
    *)
      log "mode=$mode already configured - no switch/reboot needed"
      return 1
      ;;
  esac
}

wait_for_api || { log "panel API never answered within ${API_WAIT}s - giving up this invocation"; exit 0; }

if [ ! -f "$NEG_FILE" ]; then
  log "starting a fresh negotiation - ecm is always tried first"
  : > "$NEG_FILE"
  if switch_to ecm; then
    exit 0
  fi
  mode=ecm
else
  mode="$(current_target_mode)"
  log "resuming negotiation on mode=$mode (already tried: $(tr '\n' ',' < "$NEG_FILE" | sed 's/,$//'))"
fi

ifc="$(wait_for_iface)" || { log "no net interface appeared within ${IFACE_WAIT}s for mode=$mode"; exit 0; }

if wait_for_host_activity "$ifc"; then
  echo "$mode" > "$STATE_FILE"
  log "host is sending frames on $ifc (mode=$mode) - negotiation done"
  dump_diag "$ifc" "$mode"
  rm -f "$NEG_FILE"
  exit 0
fi
log "silence on $ifc (mode=$mode) after ${CHECK_WAIT}s - host has no driver for this mode"
already_tried "$mode" || mark_tried "$mode"

for candidate in ecm rndis; do
  already_tried "$candidate" && continue
  if switch_to "$candidate"; then
    exit 0
  fi
done

log "exhausted all candidates this negotiation (tried: $(tr '\n' ',' < "$NEG_FILE" | sed 's/,$//')) - leaving USB in mode=$mode"
rm -f "$NEG_FILE"
