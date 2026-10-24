// Talks to the on-device cgi-bin/api script (busybox httpd), not a Go/REST
// backend. Single endpoint, ?action=<name>, token-based auth (no cookies/
// CSRF), form-urlencoded bodies (the shell's get_param() only understands
// QUERY_STRING + form-encoded POST data, never JSON). Success responses are
// flat JSON objects; failures are {"error":{"code","message"}}.

const TOKEN_KEY = "panel.token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}

export function notifyUnauthorized() {
  setToken("");
  window.dispatchEvent(new Event("panel:unauthorized"));
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export interface ActionOptions {
  method?: "GET" | "POST";
  params?: Record<string, string | number | undefined>;
}

// action(): call ?action=<name>, GET query or POST form body per method.
export async function action<T>(name: string, options: ActionOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const token = getToken();
  const params = new URLSearchParams();
  params.set("action", name);
  if (token) params.set("token", token);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }

  const init: RequestInit = { method };
  let url = "/cgi-bin/api";
  if (method === "GET") {
    url += `?${params.toString()}`;
  } else {
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    init.body = params.toString();
  }

  const response = await fetch(url, init);
  if (response.status === 403) {
    notifyUnauthorized();
    throw new ApiError("invalid_token", "token invalid");
  }
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("bad_response", text || `HTTP ${response.status}`);
  }
  if (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)) {
    const err = (payload as { error?: { code?: string; message?: string } }).error ?? {};
    throw new ApiError(err.code || "error", err.message || "请求失败");
  }
  return payload as T;
}

export function apiMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "请求未完成，检查设备连接后重试";
}

export async function authCheck(): Promise<boolean> {
  try {
    await action("auth");
    return true;
  } catch {
    return false;
  }
}

export async function changeToken(newToken: string): Promise<void> {
  await action("change-token", { method: "POST", params: { new_token: newToken } });
  setToken(newToken);
}
