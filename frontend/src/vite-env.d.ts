/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API address for the native builds, e.g. "https://host/personalos/api". Unset on the web. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
