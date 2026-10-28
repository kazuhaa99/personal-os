// The app can be served under a path prefix (e.g. https://host/personalos/), set at build
// time with VITE_BASE. Everything that points at our own files or API goes through here.

/** "/" or "/prefix/" — always with a trailing slash. */
export const BASE: string = import.meta.env.BASE_URL;

/** URL of a file from public/ (or any app path): asset("/media/x.jpg") -> "/prefix/media/x.jpg". */
export const asset = (path: string): string => BASE + path.replace(/^\/+/, "");

/**
 * Where the API lives, without a trailing slash. On the web it is next to the app ("/prefix/api",
 * same origin, cookie sign-in). Native builds (iOS / macOS shells) are served from
 * capacitor://localhost / tauri://localhost, so they set an absolute VITE_API_BASE at build time,
 * e.g. "https://host/personalos/api".
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE || `${BASE}api`).replace(/\/+$/, "");

/** apiUrl("/accounts?x=1") -> "<API_BASE>/accounts?x=1". */
export const apiUrl = (path: string): string => API_BASE + path;

/** The server builds some links as "/api/..." (avatars); point them at API_BASE. Others pass through. */
export function resolveApiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/api/") ? apiUrl(url.slice("/api".length)) : url;
}
