# DJI 4G module panel

[中文](README.zh-CN.md)

Web admin panel for the DJI/Baiwang 4G module (disguised as a Quectel EC25),
running entirely on the module itself — a busybox httpd serving a static
React SPA plus a shell/AT cgi-bin backend. No Go/Node runtime on the device;
the module has ~42MB RAM and ~15MB free storage, which rules that out.

## Layout

- `frontend/` — React + TypeScript + Vite + Tailwind source (our own UI
  design). Build with `npm install && npm run build` inside `frontend/`, or
  run `build-frontend.ps1` from this directory.
- `www/` — the deployed tree: SPA build output (`index.html`, `assets/`,
  `flags/`, `favicon.svg`, `theme-init.js`) plus `cgi-bin/api`, the JSON
  backend. `build-frontend.ps1` regenerates everything under `www/` except
  `cgi-bin/`.
- `httpd.conf` — MIME type additions for busybox httpd. Its built-in table
  only covers a handful of extensions; `.js`/`.svg`/`.woff2`/etc. would
  otherwise be served as `application/octet-stream`, which Chrome refuses to
  execute as an ES module script. Pushed to `/data/module-panel/httpd.conf`
  and referenced via `busybox httpd -c` in `start.sh`.
- `start.sh` / `stop.sh` / `init.d-module-panel` — on-device service scripts.
- `install.ps1` — pushes everything to the device over adb and (re)starts it.

## Build + deploy

```powershell
cd module-panel
./build-frontend.ps1   # npm install && npm run build, copies dist/ into www/
./install.ps1           # adb push everything, chmod, start
```

Default location on the module:

- Web root: `/data/module-panel/www`
- CGI API: `/data/module-panel/www/cgi-bin/api`
- Token: `/data/module-panel/token`
- Log file: `/data/module-panel/panel.log`

Open from the computer/phone connected over RNDIS:

```text
http://192.168.225.1/  (or http://dji-celluar.com/ if that still resolves)
```

If the page loads but nothing works, check the module's USB network mode —
`AT+QCFG="usbnet"` must be `3` (RNDIS); if it's been switched to ECM (`1`) or
anything else, the panel is only reachable device-locally (over adb), not
from a PC/phone. Use the panel's own "AT 终端" (Settings page) to run
`AT+QCFG="usbnet",3` + `AT+QCFG="usbcfg",0x2C7C,0x0125,1,1,1,1,1,1,0` +
`AT+CFUN=1,1`, or `curl`/`wget` the `restore-rndis` action directly.

## Auth

Single shared token (`/data/module-panel/token`, a UUID generated on first
start). The frontend sends it as `?token=` on every request — no
username/password, no cookies/CSRF (there's no server-side session state to
protect). Change it from Settings → 访问令牌, or `action=change-token`.

## API contract

Single endpoint, `GET/POST /cgi-bin/api?action=<name>`. GET reads use the
query string; mutations POST a `application/x-www-form-urlencoded` body
(the shell script's `get_param()` never parses JSON bodies). Success
responses are flat JSON objects; failures are
`{"error":{"code":"...","message":"..."}}`. See `www/cgi-bin/api` for the
full action list (`status`, `traffic`, `scan-cells`, `cell-lock`/
`cell-unlock`, `sms-list`/`sms-send`/`sms-delete`/`sms-sync`, `at`, plus a few
admin actions carried over from before: `apn-query`/`apn-set`, `dns-query`/`dns-set`, `net`, `ping`,
`restore-rndis`, `reboot`).

The AT command layer (`at_send`/`at_batch`/SMS PDU handling/etc.) predates
the JSON rewrite and is unchanged — only the response formatting changed
from plain text to JSON.

## Known limitations

- SMS on a 中国广电 (CBN) SIM: this firmware's IMS SMS path does not work, so
  `AT+CMGS` can hang for tens of seconds before failing with "SMS prompt not
  received" — visible in the Overview page's SIM panel as a warning banner,
  and the SMS compose button will show a real (slow) error rather than
  succeeding. Swap in a China Mobile/Unicom/Telecom SIM to send SMS; receive
  and history sync are unaffected.
- Multi-line SMS bodies: the flat `sms.db` store (inherited from before the
  JSON rewrite) is one-record-per-line; a message body containing a literal
  newline can get truncated to its first line in the JSON view. Pre-existing
  limitation, not touched in this rewrite.
