import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecureStore } from "@/platform/secureStore";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function memoryStore(initial: Record<string, string> = {}): SecureStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => { data[k] = v; },
    remove: async (k) => { delete data[k]; },
  };
}

const pair = (n: number) => ({ token_type: "Bearer", access_token: `posat_a${n}`, refresh_token: `posrt_f.r${n}`, expires_in: 900, refresh_expires_in: 1, user: { username: "me" } });

/** Fresh modules for a native (iOS) build with an in-memory Keychain. */
async function native(store = memoryStore()) {
  vi.resetModules();
  vi.stubEnv("VITE_PLATFORM", "ios");
  vi.stubEnv("VITE_API_BASE", "https://pos.example.com/api");
  const secure = await import("@/platform/secureStore");
  secure.useSecureStoreForTests(store);
  return { store, session: await import("./nativeSession"), api: (await import("./api")).api };
}

const authOf = (call: unknown[]) => new Headers((call[1] as RequestInit | undefined)?.headers).get("Authorization");

describe("native sign-in", () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetch = vi.fn(); vi.stubGlobal("fetch", fetch); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("signs in for tokens, keeps the refresh token in the Keychain and sends the access token", async () => {
    const { store, session, api } = await native();
    fetch.mockResolvedValueOnce(json(pair(1))).mockResolvedValueOnce(json([]));
    const user = await session.signIn("me", "secret password");
    expect(user.username).toBe("me");
    expect(fetch.mock.calls[0][0]).toBe("https://pos.example.com/api/auth/token");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ identifier: "me", password: "secret password" });
    expect(store.data["pos.refreshToken"]).toBe("posrt_f.r1");
    await api.get("/accounts");
    expect(authOf(fetch.mock.calls[1])).toBe("Bearer posat_a1");
  });

  it("refreshes once on 401 and retries, even with several requests in flight", async () => {
    const { session, api } = await native();
    fetch.mockResolvedValueOnce(json(pair(1)));
    await session.signIn("me", "pw");
    let refreshes = 0;
    fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/token/refresh")) { refreshes++; return json(pair(2)); }
      return authOf([url, init]) === "Bearer posat_a2" ? json(["ok"]) : json({ detail: "Sign in required" }, 401);
    });
    const results = await Promise.all([api.get("/accounts"), api.get("/tasks"), api.get("/habits")]);
    expect(results).toEqual([["ok"], ["ok"], ["ok"]]);
    expect(refreshes).toBe(1);
  });

  it("restores the session from the Keychain on a cold start", async () => {
    const { store, api } = await native(memoryStore({ "pos.refreshToken": "posrt_f.r1" }));
    fetch.mockResolvedValueOnce(json(pair(2))).mockResolvedValueOnce(json({ authenticated: true }));
    await api.get("/auth/me");
    expect(fetch.mock.calls[0][0]).toBe("https://pos.example.com/api/auth/token/refresh");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ refresh_token: "posrt_f.r1" });
    expect(authOf(fetch.mock.calls[1])).toBe("Bearer posat_a2");
    expect(store.data["pos.refreshToken"]).toBe("posrt_f.r2");
  });

  it("forgets a refresh token the server rejects", async () => {
    const { store, api } = await native(memoryStore({ "pos.refreshToken": "posrt_f.old" }));
    fetch.mockResolvedValueOnce(json({ error: { code: "unauthorized" } }, 401)).mockResolvedValueOnce(json({ authenticated: false }));
    expect(await api.get("/auth/me")).toEqual({ authenticated: false });
    expect(store.data["pos.refreshToken"]).toBeUndefined();
    expect(authOf(fetch.mock.calls[1])).toBeNull();
  });

  it("keeps the refresh token when the server can't be reached", async () => {
    const { store, api } = await native(memoryStore({ "pos.refreshToken": "posrt_f.r1" }));
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.get("/auth/me")).rejects.toThrow();
    expect(store.data["pos.refreshToken"]).toBe("posrt_f.r1");
  });

  it("signs out: revokes on the server and clears the Keychain", async () => {
    const { store, session, api } = await native();
    fetch.mockResolvedValueOnce(json(pair(1))).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({ authenticated: false }));
    await session.signIn("me", "pw");
    await session.signOut();
    expect(fetch.mock.calls[1][0]).toBe("https://pos.example.com/api/auth/token/revoke");
    expect(authOf(fetch.mock.calls[1])).toBe("Bearer posat_a1");
    expect(store.data["pos.refreshToken"]).toBeUndefined();
    await api.get("/auth/me");
    expect(authOf(fetch.mock.calls[2])).toBeNull();
  });

  it("refreshes an access token that is about to expire before using it", async () => {
    const { session, api } = await native();
    fetch.mockResolvedValueOnce(json(pair(1)));
    await session.signIn("me", "pw");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 15 * 60_000);
    fetch.mockResolvedValueOnce(json(pair(2))).mockResolvedValueOnce(json({ authenticated: true }));
    await api.get("/auth/me"); // never answers 401, so it must not rely on one
    vi.useRealTimers();
    expect(fetch.mock.calls[1][0]).toBe("https://pos.example.com/api/auth/token/refresh");
    expect(authOf(fetch.mock.calls[2])).toBe("Bearer posat_a2");
  });

  it("a refresh that finishes after sign-out does not bring the session back", async () => {
    const { store, session } = await native();
    fetch.mockResolvedValueOnce(json(pair(1)));
    await session.signIn("me", "pw");
    let answer: (r: Response) => void = () => {};
    fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { answer = resolve; }));
    const refreshing = session.refreshSession(); // e.g. started by a request just before sign-out
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await session.signOut();
    answer(json(pair(2)));
    await refreshing;
    expect(store.data["pos.refreshToken"]).toBeUndefined();
    expect(session.accessToken()).toBeNull();
  });

  it("signing out with an expired access token refreshes it first, so the server session really ends", async () => {
    const { session } = await native(memoryStore({ "pos.refreshToken": "posrt_f.r1" }));
    fetch.mockResolvedValueOnce(json(pair(2))).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await session.signOut();
    expect(fetch.mock.calls[1][0]).toBe("https://pos.example.com/api/auth/token/revoke");
    expect(authOf(fetch.mock.calls[1])).toBe("Bearer posat_a2");
  });

  it("a keychain that can't be written is a failed sign-in, not a half-signed-in app", async () => {
    const store = memoryStore();
    store.set = async () => { throw new Error("keychain locked"); };
    const { session } = await native(store);
    fetch.mockResolvedValueOnce(json(pair(1)));
    await expect(session.signIn("me", "pw")).rejects.toThrow("keychain locked");
    expect(session.accessToken()).toBeNull();
  });

  it("downloads (CSV export) refresh an expired token too", async () => {
    const { session, api } = await native();
    fetch.mockResolvedValueOnce(json(pair(1)));
    await session.signIn("me", "pw");
    fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/token/refresh")) return json(pair(2));
      return authOf([url, init]) === "Bearer posat_a2" ? new Response("a,b") : json({ detail: "Sign in required" }, 401);
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await api.download("/transactions/export", {}, "tx.csv");
    expect(fetch.mock.calls.some((c) => String(c[0]).endsWith("/auth/token/refresh"))).toBe(true);
  });

  it("says plainly when the server can't be reached", async () => {
    const { api } = await native(memoryStore({ "pos.refreshToken": "posrt_f.r1" }));
    fetch.mockRejectedValue(new TypeError("Load failed"));
    await expect(api.get("/accounts")).rejects.toThrow(/no connection to the server/i);
  });

  it("is not used on the web", async () => {
    vi.resetModules();
    const { api } = await import("./api");
    fetch.mockResolvedValue(json({ detail: "Sign in required" }, 401));
    await expect(api.get("/accounts")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(authOf(fetch.mock.calls[0])).toBeNull();
  });
});
