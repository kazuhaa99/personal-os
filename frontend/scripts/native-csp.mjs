// Content Security Policy of the macOS app's release build: the WebView may talk only to the
// app's own API (VITE_API_BASE) and Tauri's IPC. src-tauri/tauri.conf.json holds the development
// policy (local API only); scripts/tauri-build.mjs passes this one to `tauri build`.

/** @param {string | undefined} apiBase */
export function nativeCsp(apiBase) {
  if (!apiBase) throw new Error("The macOS release build needs VITE_API_BASE, e.g. https://pos.example.com/api");
  const api = new URL(apiBase).origin;
  return {
    "default-src": "'self'",
    "script-src": "'self'",
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: blob: ${api}`,
    "font-src": "'self' data:",
    "connect-src": `'self' ipc: http://ipc.localhost ${api}`,
  };
}
