#!/bin/sh
# pin-autounlock.sh - one-shot, runs once per boot. If the SIM is currently
# asking for its PIN and we have a PIN saved (only ever saved after a
# manual attempt through the panel that was confirmed to succeed - see
# cgi-bin/api's pin-unlock action), try that saved PIN exactly once.
#
# SAFETY: this NEVER loops or retries. A wrong PIN entered 3 times in a row
# permanently PUK-locks most SIMs (confirmed on this SIM via
# AT+QPINC="SC" -> currently 3 of 3 attempts remaining). Retrying a bad
# saved PIN across repeated reboots would silently burn through that limit.
# Before attempting, this also checks the remaining attempt count itself
# and refuses to try if only 1 attempt is left, logging instead - that
# last attempt should be a deliberate, manual one, not an automatic one.

ROOT=/data/module-panel
PIN_FILE="$ROOT/sim.pin"
PANEL_IP="${PANEL_IP:-192.168.225.1}"
LOG="$ROOT/pin-autounlock.log"
LOCK_FILE="$ROOT/pin-autounlock.lastrun"
COOLDOWN=180

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

[ -s "$PIN_FILE" ] || exit 0

# Same re-entry guard as usbmode-auto.sh, and for the same reason: something
# on this device re-runs the whole module-panel boot sequence on every USB
# re-enumeration, including the ones usbmode-auto.sh itself triggers while
# negotiating a mode. Without this, a single boot could fire this script
# several times in a row - each attempt sends the correct saved PIN so it
# wouldn't burn retries, but there's no reason to hammer AT+CPIN repeatedly.
if [ -f "$LOCK_FILE" ]; then
  last_run="$(cat "$LOCK_FILE" 2>/dev/null)"
  now="$(date +%s 2>/dev/null)"
  if [ -n "$last_run" ] && [ -n "$now" ]; then
    elapsed=$((now - last_run))
    if [ "$elapsed" -ge 0 ] && [ "$elapsed" -lt "$COOLDOWN" ]; then
      log "skipping - last run was ${elapsed}s ago (< ${COOLDOWN}s cooldown)"
      exit 0
    fi
  fi
fi
date +%s > "$LOCK_FILE" 2>/dev/null

api_call() {
  token="$(cat "$ROOT/token" 2>/dev/null)"
  [ -n "$token" ] || return 1
  wget -q -T 20 -O - "http://$PANEL_IP/cgi-bin/api?action=$1&token=$token" 2>/dev/null
}

# Wait for the panel + AT stack to actually be reachable after boot.
i=0
while [ "$i" -lt 30 ]; do
  api_call 'usbnet-query' | grep -q '"mode"' && break
  i=$((i + 1))
  sleep 1
done

status="$(api_call 'pin-status')"
log "boot status: $status"

case "$status" in
  *'"sim_state":"SIM PIN"'*) ;;
  *) log "SIM does not need a PIN right now - nothing to do"; exit 0 ;;
esac

remaining="$(printf '%s' "$status" | sed -n 's/.*"attempts_remaining":\([0-9]*\).*/\1/p')"
if [ -n "$remaining" ] && [ "$remaining" -le 1 ] 2>/dev/null; then
  log "only $remaining PIN attempt(s) left - refusing to auto-try, needs manual entry"
  exit 0
fi

pin="$(cat "$PIN_FILE" 2>/dev/null)"
[ -n "$pin" ] || exit 0

result="$(api_call "pin-unlock&pin=$pin")"
log "auto-unlock attempt result: $result"
