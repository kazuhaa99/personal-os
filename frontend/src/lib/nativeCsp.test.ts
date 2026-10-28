import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without type declarations
import { nativeCsp } from "../../scripts/native-csp.mjs";

describe("nativeCsp (macOS release build)", () => {
  it("lets the app reach only its own API, not any https site", () => {
    const csp = nativeCsp("https://pos.example.com/personalos/api");
    expect(csp["connect-src"]).toBe("'self' ipc: http://ipc.localhost https://pos.example.com");
    expect(csp["img-src"]).toBe("'self' data: blob: https://pos.example.com");
    expect(JSON.stringify(csp)).not.toMatch(/https:(?!\/\/pos\.example\.com)/);
    expect(csp["script-src"]).toBe("'self'");
  });

  it("keeps a local development API's port", () => {
    expect(nativeCsp("http://127.0.0.1:8000/api")["connect-src"]).toContain("http://127.0.0.1:8000");
  });

  it("refuses to build without an API address", () => {
    expect(() => nativeCsp(undefined)).toThrow(/VITE_API_BASE/);
  });
});
