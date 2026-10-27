/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const apiTarget = process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000";
// Path prefix the app is served under, e.g. "/personalos/" (default: the site root).
const base = `/${(process.env.VITE_BASE ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
const apiPrefix = `${base}api`;
// Native builds only: absolute API address (see src/lib/base.ts). HTTPS, except a local dev server.
const apiBase = process.env.VITE_API_BASE;
if (apiBase && !/^(https:\/\/[^/\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)(\/\S*)?$/.test(apiBase)) {
  throw new Error(`VITE_API_BASE must be an https:// URL (or http://localhost), got "${apiBase}"`);
}
// A native production build without it would call capacitor://localhost/api or tauri://localhost/api.
if (process.env.VITE_PLATFORM && process.argv.includes("build") && !apiBase) {
  throw new Error("Native builds need VITE_API_BASE, e.g. VITE_API_BASE=https://pos.example.com/api npm run mac:build");
}

// Content Security Policy of the web build: only this origin's own scripts (no inline ones, see
// public/boot.js), styles, images and API. A meta tag, so it holds however the files are served.
// The native shells set their own policy (src-tauri/tauri.conf.json); the dev server needs inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React and the toast library set inline styles
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const webCsp: Plugin = {
  name: "pos-web-csp",
  apply: "build",
  transformIndexHtml: (html) =>
    process.env.VITE_PLATFORM ? html : html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP};" />`),
};

// Long-lived vendor chunks. By path, not by package list: the list form also pulls a package's own
// dependencies into its chunk, and a small one shared with the app (clsx) then made the first
// screen preload the whole charting library.
const CHUNKS: [RegExp, string][] = [
  [/\/node_modules\/(recharts|recharts-scale|victory-vendor|d3-[^/]+|decimal\.js-light)\//, "charts"],
  [/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//, "motion"],
  [/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router|@tanstack\/[^/]+|clsx)\//, "vendor"],
];

function chunkFor(id: string): string | undefined {
  return CHUNKS.find(([pattern]) => pattern.test(id))?.[1];
}

export default defineConfig({
  base,
  plugins: [react(), webCsp],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // The browser only ever talks to the Vite origin; the API is proxied, so no
    // database or backend credentials are exposed to the frontend.
    proxy: {
      [apiPrefix]: { target: apiTarget, changeOrigin: false, rewrite: (p) => p.replace(apiPrefix, "/api") },
    },
  },
  build: {
    rollupOptions: { output: { manualChunks: chunkFor } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"], // e2e/ is Playwright's
  },
});
