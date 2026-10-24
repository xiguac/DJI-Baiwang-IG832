import { useSyncExternalStore } from "react";
import { message } from "../ui";

/* ---------------------------------------------------------------------------
 * Clipboard copy.
 * ------------------------------------------------------------------------- */
export async function copyText(value: unknown, msg = "已复制"): Promise<boolean> {
  const text = String(value ?? "").trim();
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      message.success(msg);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.className = "fixed left-0 top-0 h-px w-px opacity-0 pointer-events-none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) {
      message.success(msg);
      return true;
    }
  } catch {
    /* fall through */
  }
  message.warning("浏览器限制，请手动复制");
  return false;
}

/* ---------------------------------------------------------------------------
 * Sensitive-info visibility store, shared across cards on the overview page.
 * ------------------------------------------------------------------------- */
const SENSITIVE_KEY = "panel_show_sensitive";
let sensitiveValue = readSensitive();
const sensitiveListeners = new Set<() => void>();

function readSensitive(): boolean {
  try {
    return typeof window === "undefined" ? false : window.localStorage.getItem(SENSITIVE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeSensitive(value: boolean) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(SENSITIVE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}
function setSensitive(value: boolean) {
  if (sensitiveValue === value) return;
  sensitiveValue = value;
  writeSensitive(value);
  for (const listener of sensitiveListeners) listener();
}
function subscribeSensitive(listener: () => void) {
  sensitiveListeners.add(listener);
  return () => {
    sensitiveListeners.delete(listener);
  };
}

export function useShowSensitive(): [boolean, () => void] {
  const value = useSyncExternalStore(subscribeSensitive, () => sensitiveValue);
  return [value, () => setSensitive(!sensitiveValue)];
}

/* ---------------------------------------------------------------------------
 * Signal helpers. Thresholds are RSSI-calibrated (AT+CSQ style dBm), matching
 * the panel's csq_rssi field (converted to dBm: -113 + 2*csq).
 * ------------------------------------------------------------------------- */
export function signalValid(dbm?: number | null): boolean {
  return typeof dbm === "number" && Number.isFinite(dbm) && dbm !== 0 && dbm !== -999;
}
export function signalLevel(dbm?: number | null): number {
  if (!signalValid(dbm)) return 0;
  const d = dbm as number;
  return d >= -70 ? 5 : d >= -85 ? 4 : d >= -100 ? 3 : d >= -110 ? 2 : 1;
}
export type SignalTone = "green" | "amber" | "red" | "gray";
export function signalTone(dbm?: number | null): SignalTone {
  if (!signalValid(dbm)) return "gray";
  const d = dbm as number;
  return d >= -85 ? "green" : d >= -100 ? "amber" : "red";
}

// AT+CSQ's rssi index (0-31, 99=unknown) -> dBm, per 3GPP 27.007.
export function csqToDbm(csq?: string | number | null): number | null {
  const n = typeof csq === "string" ? parseInt(csq, 10) : csq;
  if (n === null || n === undefined || Number.isNaN(n) || n === 99) return null;
  return -113 + 2 * n;
}
