// Which shell runs this build, fixed at build time: "web" (browser / PWA), "ios" (Capacitor) or
// "macos" (Tauri). Native-only code is behind IS_NATIVE and loaded with dynamic imports, so the
// web bundle never pulls in the shells' plugins.

export type Platform = "web" | "ios" | "macos";

// Plain comparisons (not a lookup) so the bundler can fold them and drop native code from the web build.
export const PLATFORM: Platform =
  import.meta.env.VITE_PLATFORM === "ios" ? "ios" : import.meta.env.VITE_PLATFORM === "macos" ? "macos" : "web";
export const IS_NATIVE: boolean = PLATFORM !== "web";
