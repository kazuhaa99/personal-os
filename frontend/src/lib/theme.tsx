import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { averageColor, clearWallpaper, loadWallpaper, prepareImage, saveWallpaper } from "./wallpaperStore";
import { asset } from "./base";
import { accentFor, triplet, vividFromImage, type RGB } from "./palette";

export type ThemeMode = "system" | "light" | "dark";
export type WallpaperId = "alpine" | "lake" | "ocean" | "night" | "none" | "custom";

export const WALLPAPERS: { id: WallpaperId; label: string; src?: string; color: string }[] = [
  { id: "alpine", label: "Alpine dusk", src: asset("/media/peaks.jpg"), color: "#50747a" },
  { id: "lake", label: "Moraine Lake", src: asset("/media/moraine.jpg"), color: "#527f93" },
  { id: "ocean", label: "Open ocean", src: asset("/media/ocean.jpg"), color: "#93abb9" },
  { id: "night", label: "Night Earth", src: asset("/media/earth.jpg"), color: "#0f0f1e" },
  { id: "none", label: "Plain", color: "transparent" },
];

export interface CustomWallpaper { src: string; color: string }

/** "wallpaper": accent colour taken from the wallpaper; "default": the standard blue. */
export type AccentMode = "wallpaper" | "default";

interface ThemeState {
  mode: ThemeMode;
  resolved: "light" | "dark";
  wallpaper: WallpaperId;
  /** The uploaded photo, if any (object URL). */
  custom: CustomWallpaper | null;
  /** What to actually paint: the selected wallpaper resolved to an image + colour. */
  active: { src?: string; color: string };
  setMode: (m: ThemeMode) => void;
  setWallpaper: (w: WallpaperId) => void;
  uploadWallpaper: (file: File) => Promise<void>;
  removeCustomWallpaper: () => Promise<void>;
  toggle: () => void;
  accentMode: AccentMode;
  setAccentMode: (m: AccentMode) => void;
  /** Tint the sidebar/toolbar and hero glass with the wallpaper colour. */
  tint: boolean;
  setTint: (on: boolean) => void;
  /** The wallpaper's vivid colour; null = none (no wallpaper, or a colourless one); undefined = still reading it. */
  vivid: RGB | null | undefined;
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
  const [wallpaper, setWallpaperState] = useState<WallpaperId>(() => read("pos.wallpaper", "lake", [...WALLPAPERS.map((w) => w.id), "custom"]));
  const [custom, setCustom] = useState<CustomWallpaper | null>(null);
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

  // Restore the uploaded photo from IndexedDB.
  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    loadWallpaper().then(async (blob) => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setCustom({ src: url, color: await averageColor(blob).catch(() => "#555") });
    });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, []);

  const uploadWallpaper = useCallback(async (file: File) => {
    const blob = await prepareImage(file);
    await saveWallpaper(blob);
    const color = await averageColor(blob).catch(() => "#555");
    setCustom((prev) => { if (prev) URL.revokeObjectURL(prev.src); return { src: URL.createObjectURL(blob), color }; });
    setWallpaper("custom");
  }, [setWallpaper]);

  const removeCustomWallpaper = useCallback(async () => {
    await clearWallpaper();
    setCustom((prev) => { if (prev) URL.revokeObjectURL(prev.src); return null; });
    setWallpaperState((w) => { if (w === "custom") { write("pos.wallpaper", "lake"); return "lake"; } return w; });
  }, []);

  const active = useMemo(() => {
    if (wallpaper === "custom") return custom ?? { src: undefined, color: "transparent" };
    const wp = WALLPAPERS.find((w) => w.id === wallpaper) ?? WALLPAPERS[1];
    return { src: wp.src, color: wp.color };
  }, [wallpaper, custom]);

  const toggle = useCallback(() => setMode(resolved === "dark" ? "light" : "dark"), [resolved, setMode]);

  // ---- colours from the wallpaper
  const [accentMode, setAccentModeState] = useState<AccentMode>(() => read("pos.accent", "wallpaper", ["wallpaper", "default"]));
  const [tint, setTintState] = useState(() => read("pos.tint", "on", ["on", "off"]) === "on");
  // undefined while the wallpaper is being analysed: keep whatever colours are on screen (the ones
  // index.html restored before React started) instead of flashing the default blue.
  const [vivid, setVivid] = useState<RGB | null | undefined>(undefined);
  const setAccentMode = useCallback((m: AccentMode) => { setAccentModeState(m); write("pos.accent", m); }, []);
  const setTint = useCallback((on: boolean) => { setTintState(on); write("pos.tint", on ? "on" : "off"); }, []);

  useEffect(() => {
    if (!active.src) { setVivid(null); return; }
    let cancelled = false;
    vividFromImage(active.src).then((c) => { if (!cancelled) setVivid(c); }, () => { if (!cancelled) setVivid(null); });
    return () => { cancelled = true; };
  }, [active.src]);

  useEffect(() => {
    if (vivid === undefined) return;
    const root = document.documentElement.style;
    const vars: Record<string, string> = {};
    if (vivid && accentMode === "wallpaper") {
      const a = accentFor(vivid, resolved);
      vars["--accent"] = triplet(a.accent);
      vars["--accent-ink"] = triplet(a.ink);
    }
    if (vivid && tint) vars["--tint"] = `rgb(${triplet(vivid)} / ${resolved === "dark" ? 0.16 : 0.12})`;
    for (const name of ["--accent", "--accent-ink", "--tint"]) {
      if (vars[name]) root.setProperty(name, vars[name]); else root.removeProperty(name);
    }
    // Remembered so index.html can paint the same colours before React starts (no blue flash).
    write("pos.colors", JSON.stringify({ theme: resolved, vars }));
  }, [vivid, accentMode, tint, resolved]);

  const value = useMemo(
    () => ({ mode, resolved, wallpaper, custom, active, setMode, setWallpaper, uploadWallpaper, removeCustomWallpaper, toggle, accentMode, setAccentMode, tint, setTint, vivid }),
    [mode, resolved, wallpaper, custom, active, setMode, setWallpaper, uploadWallpaper, removeCustomWallpaper, toggle, accentMode, setAccentMode, tint, setTint, vivid],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
