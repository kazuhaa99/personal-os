/// <reference types="vitest" />
import { defineConfig } from "vite";
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

export default defineConfig({
  base,
  plugins: [react()],
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
    rollupOptions: { output: { manualChunks: { charts: ["recharts"], motion: ["framer-motion"], vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"] } } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"], // e2e/ is Playwright's
  },
});
