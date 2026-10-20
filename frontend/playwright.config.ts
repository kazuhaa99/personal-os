import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";

// End-to-end tests against a production build and an isolated API + database
// (see e2e/start-api.mjs). Runs on the locally installed Chrome; no browser download.
//   npm run e2e

// One throwaway admin password per run, shared with the API and the test workers via env.
process.env.E2E_ADMIN_PASSWORD ??= randomBytes(12).toString("base64url");
// E2E_BASE=/personalos/ runs the same suite against a build served under a path prefix.
const base = `/${(process.env.E2E_BASE ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.out/results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:4174${base}`,
    channel: "chrome",
    locale: "en-US",
    serviceWorkers: "block", // the PWA cache is not under test here
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/start-api.mjs",
      url: "http://127.0.0.1:8001/api/auth/me",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run build && npx vite preview --host 127.0.0.1 --port 4174 --strictPort",
      url: `http://127.0.0.1:4174${base}`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { VITE_API_PROXY: "http://127.0.0.1:8001", VITE_BASE: base },
    },
  ],
});
