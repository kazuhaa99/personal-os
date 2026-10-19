/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const apiTarget = process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // The browser only ever talks to the Vite origin; the API is proxied, so no
    // database or backend credentials are exposed to the frontend.
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  build: {
    rollupOptions: { output: { manualChunks: { charts: ["recharts"], motion: ["framer-motion"], vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"] } } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
  },
});
