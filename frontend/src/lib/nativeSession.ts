// Sign-in for the native shells. Their WebViews (capacitor://localhost, tauri://localhost) never
// get the web's SameSite=Strict cookie, so they use the API's bearer tokens instead:
// - the short-lived access token lives in memory only;
// - the refresh token lives in the OS keychain and survives restarts;
// - every refresh rotates both (the server revokes the session if an old refresh token shows up).
// lib/api.ts calls accessToken() / refreshSession(); the web never does.

import { toApiError } from "./apiError";
import { apiUrl } from "./base";
import { getLang } from "./i18n";
import type { AuthUser } from "./types";
import { PLATFORM } from "@/platform";
import { secureStore } from "@/platform/secureStore";

const REFRESH_KEY = "pos.refreshToken";

interface TokenPair {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export type RefreshResult = "ok" | "signed-out";

let access: string | null = null;
let inFlight: Promise<RefreshResult> | null = null;

export const accessToken = (): string | null => access;

async function post(path: string, body: unknown, bearer?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Accept-Language": getLang() };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(body) });
}

async function keep(pair: TokenPair): Promise<AuthUser> {
  access = pair.access_token;
  await (await secureStore()).set(REFRESH_KEY, pair.refresh_token);
  return pair.user;
}

async function forget(): Promise<void> {
  access = null;
  await (await secureStore()).remove(REFRESH_KEY);
}

/** Password sign-in; failures throw ApiError like any API call (wrong password, unverified email…). */
export async function signIn(identifier: string, password: string): Promise<AuthUser> {
  const res = await post("/auth/token", { identifier, password, device_name: PLATFORM === "ios" ? "iPhone" : "Mac" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, data);
  return keep(data as TokenPair);
}

/**
 * Swap the stored refresh token for a new pair. One refresh at a time: concurrent callers share it.
 * A rejected token is forgotten ("signed-out"); a network failure throws and keeps it for later.
 */
export function refreshSession(): Promise<RefreshResult> {
  inFlight ??= (async () => {
    try {
      const token = await (await secureStore()).get(REFRESH_KEY);
      if (!token) return "signed-out";
      const res = await post("/auth/token/refresh", { refresh_token: token });
      if (res.status === 401) {
        await forget();
        return "signed-out";
      }
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      await keep((await res.json()) as TokenPair);
      return "ok";
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Sign this app out on the server too; the keychain is cleared even when offline. */
export async function signOut(): Promise<void> {
  try {
    if (access) await post("/auth/token/revoke", {}, access);
  } catch {
    /* offline: the server session expires on its own */
  } finally {
    await forget();
  }
}
