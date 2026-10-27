// Sign-in for the native shells. Their WebViews (capacitor://localhost, tauri://localhost) never
// get the web's SameSite=Strict cookie, so they use the API's bearer tokens instead:
// - the short-lived access token lives in memory only, and is renewed shortly before it expires;
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
/** Renew the access token this long before the server would reject it. */
const EARLY_REFRESH_MS = 60_000;

interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

export type RefreshResult = "ok" | "signed-out";

let access: string | null = null;
let accessUntil = 0;
// Bumped by every sign-in and sign-out: a refresh that started before one of them must not
// write its (now unwanted) tokens back afterwards.
let generation = 0;
let inFlight: Promise<RefreshResult> | null = null;

/** The current access token, or null when there is none or it is about to expire. */
export const accessToken = (): string | null => (access && Date.now() < accessUntil ? access : null);

async function post(path: string, body: unknown, bearer?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Accept-Language": getLang() };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(body) });
}

/** Keychain first, memory second: a token that couldn't be stored is not a session. */
async function keep(pair: TokenPair, gen: number): Promise<AuthUser> {
  if (gen !== generation) return pair.user;
  await (await secureStore()).set(REFRESH_KEY, pair.refresh_token);
  if (gen !== generation) return pair.user;
  access = pair.access_token;
  accessUntil = Date.now() + pair.expires_in * 1000 - EARLY_REFRESH_MS;
  return pair.user;
}

async function forget(): Promise<void> {
  generation++;
  access = null;
  accessUntil = 0;
  await (await secureStore()).remove(REFRESH_KEY);
}

/** Password sign-in; failures throw ApiError like any API call (wrong password, unverified email…). */
export async function signIn(identifier: string, password: string): Promise<AuthUser> {
  const gen = ++generation;
  const res = await post("/auth/token", { identifier, password, device_name: PLATFORM === "ios" ? "iPhone" : "Mac" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, data);
  return keep(data as TokenPair, gen);
}

/**
 * Swap the stored refresh token for a new pair. One refresh at a time: concurrent callers share it.
 * A rejected token is forgotten ("signed-out"); a network failure throws and keeps it for later.
 */
export function refreshSession(): Promise<RefreshResult> {
  inFlight ??= (async () => {
    const gen = generation;
    try {
      const token = await (await secureStore()).get(REFRESH_KEY);
      if (!token) return "signed-out";
      const res = await post("/auth/token/refresh", { refresh_token: token });
      if (res.status === 401) {
        if (gen === generation) await forget();
        return "signed-out";
      }
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      await keep((await res.json()) as TokenPair, gen);
      return gen === generation ? "ok" : "signed-out";
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Sign this app out on the server too (renewing a stale access token first); the keychain is
 *  cleared even when offline. */
export async function signOut(): Promise<void> {
  try {
    const token = accessToken() ?? ((await refreshSession()) === "ok" ? accessToken() : null);
    if (token) await post("/auth/token/revoke", {}, token);
  } catch {
    /* offline: the server session expires on its own */
  } finally {
    await forget();
  }
}
