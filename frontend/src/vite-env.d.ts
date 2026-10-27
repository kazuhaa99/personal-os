/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API address for the native builds, e.g. "https://host/personalos/api". Unset on the web. */
  readonly VITE_API_BASE?: string;
  /** Which shell the build is for: "ios" (Capacitor), "macos" (Tauri); unset = web. */
  readonly VITE_PLATFORM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
