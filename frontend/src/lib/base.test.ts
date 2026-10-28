import { afterEach, describe, expect, it, vi } from "vitest";

// base.ts reads the build-time env when it is first imported, so each case imports it afresh.
async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./base");
}

describe("API address", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is relative to the app's own path on the web", async () => {
    const { API_BASE, apiUrl } = await load({ BASE_URL: "/personalos/" });
    expect(API_BASE).toBe("/personalos/api");
    expect(apiUrl("/accounts?x=1")).toBe("/personalos/api/accounts?x=1");
  });

  it("is the absolute VITE_API_BASE in native builds", async () => {
    const { API_BASE, apiUrl } = await load({ VITE_API_BASE: "https://pos.example.com/personalos/api/" });
    expect(API_BASE).toBe("https://pos.example.com/personalos/api");
    expect(apiUrl("/auth/token")).toBe("https://pos.example.com/personalos/api/auth/token");
  });

  it("maps server-built /api/... links (avatars) onto the API address", async () => {
    const web = await load({ BASE_URL: "/personalos/" });
    expect(web.resolveApiUrl("/api/profile/avatar?v=3")).toBe("/personalos/api/profile/avatar?v=3");
    const native = await load({ VITE_API_BASE: "https://pos.example.com/api" });
    expect(native.resolveApiUrl("/api/profile/avatar?v=3")).toBe("https://pos.example.com/api/profile/avatar?v=3");
    expect(native.resolveApiUrl(null)).toBeNull();
    expect(native.resolveApiUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
  });
});

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends requests to the configured API address", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE", "https://pos.example.com/api");
    const fetch = vi.fn(async () => new Response(JSON.stringify([]), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("./api");
    await api.get("/accounts", { archived: true });
    expect(fetch).toHaveBeenCalledWith("https://pos.example.com/api/accounts?archived=true", expect.anything());
  });
});
