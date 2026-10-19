import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type WallpaperId = "alpine" | "lake" | "ocean" | "night" | "none";

export const WALLPAPERS: { id: WallpaperId; label: string; src?: string; color: string }[] = [
  { id: "alpine", label: "Alpine dusk", src: "/media/peaks.jpg", color: "#50747a" },
  { id: "lake", label: "Moraine Lake", src: "/media/moraine.jpg", color: "#527f93" },
  { id: "ocean", label: "Open ocean", src: "/media/ocean.jpg", color: "#93abb9" },
  { id: "night", label: "Night Earth", src: "/media/earth.jpg", color: "#0f0f1e" },
  { id: "none", label: "Plain", color: "transparent" },
];

interface ThemeState {
  mode: ThemeMode;
  resolved: "light" | "dark";
  wallpaper: WallpaperId;
  setMode: (m: ThemeMode) => void;
  setWallpaper: (w: WallpaperId) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeState | null>(null);

function read<T extends string>(key: string, fallback: T, allowed: readonly string[]): T {
  try {
    const v = localStorage.getItem(key);
    return v && allowed.includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

const prefersDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

/** Appearance (system / light / dark) and wallpaper, remembered per browser. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => read("pos.theme", "system", ["system", "light", "dark"]));
  const [wallpaper, setWallpaperState] = useState<WallpaperId>(() => read("pos.wallpaper", "lake", WALLPAPERS.map((w) => w.id)));
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", resolved);
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => { setModeState(m); write("pos.theme", m); }, []);
  const setWallpaper = useCallback((w: WallpaperId) => { setWallpaperState(w); write("pos.wallpaper", w); }, []);
  const toggle = useCallback(() => setMode(resolved === "dark" ? "light" : "dark"), [resolved, setMode]);

  const value = useMemo(() => ({ mode, resolved, wallpaper, setMode, setWallpaper, toggle }), [mode, resolved, wallpaper, setMode, setWallpaper, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
