import { getLang, t } from "./i18n";
import { ApiError, toApiError } from "./apiError";
import { apiUrl } from "./base";
import { accessToken, refreshSession } from "./nativeSession";
import { IS_NATIVE } from "@/platform";

// Thin fetch wrapper. Requests go to API_BASE (lib/base.ts): same origin on the web (proxied by
// Vite in dev, by nginx in production), an absolute URL in the native builds.

const TOKEN_KEY = "pos.apiToken";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: token lives for this page only */
  }
}

export { ApiError };

type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params: Query = {}): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
}

const isTokenEndpoint = (path: string) => path.startsWith("/auth/token");

/**
 * Web: the session cookie goes by itself; the optional manual API token from Settings is added.
 * Native: the access token (after restoring the session from the keychain on a cold start).
 */
async function authHeaders(path: string): Promise<Record<string, string>> {
  if (!IS_NATIVE) {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  if (!accessToken() && !isTokenEndpoint(path)) await refreshSession();
  const access = accessToken();
  return access ? { Authorization: `Bearer ${access}` } : {};
}

/**
 * fetch() with our credentials. Native: a 401 refreshes the session once and repeats the request
 * (or just repeats it, when another request already refreshed meanwhile). A request that can't
 * reach the server at all fails with a plain "no connection" ApiError (status 0).
 */
async function authedFetch(path: string, init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {}): Promise<Response> {
  let sentWith: string | undefined;
  const send = async () => {
    const auth = await authHeaders(path);
    sentWith = auth.Authorization;
    return fetch(apiUrl(path), { ...init, headers: { ...init.headers, ...auth } });
  };
  try {
    let res = await send();
    if (IS_NATIVE && res.status === 401 && !isTokenEndpoint(path)) {
      const now = accessToken();
      if ((now && `Bearer ${now}` !== sentWith) || (await refreshSession()) === "ok") res = await send();
    }
    return res;
  } catch (e) {
    if (e instanceof TypeError) throw new ApiError(0, t("No connection to the server"), "offline");
    throw e;
  }
}

async function request<T>(method: string, path: string, body?: unknown, init: Omit<RequestInit, "headers"> = {}): Promise<T> {
  // Accept-Language lets the server localise generated text (insights).
  const headers: Record<string, string> = { "Accept-Language": getLang() };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await authedFetch(path, { method, headers, body: payload, ...init });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw toApiError(res.status, isJson ? data : null);
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>("GET", path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T = void>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  async download(path: string, params: Query, filename: string) {
    const res = await authedFetch(path + qs(params));
    if (!res.ok) throw new ApiError(res.status, t("Export failed ({status})", { status: res.status }));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return t("Something went wrong");
}
