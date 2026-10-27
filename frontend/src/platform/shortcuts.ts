import { useEffect, useRef } from "react";
import { PLATFORM } from "./index";
import { onMenuCommand } from "./native";

export interface MacActions {
  newItem: () => void;
  search: () => void;
  settings: () => void;
}

const KEYS: Record<string, keyof MacActions> = { n: "newItem", f: "search", ",": "settings" };
const MENU: Record<string, keyof MacActions> = { new: "newItem", search: "search", settings: "settings" };

/** macOS app only: Cmd+N / Cmd+F / Cmd+, and the same commands from the app menu.
 *  In a browser these keys belong to the browser (new window, find in page, …), so they are left alone. */
export function useMacShortcuts(actions: MacActions): void {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    if (PLATFORM !== "macos") return;
    const onKey = (e: KeyboardEvent) => {
      const action = e.metaKey && !e.ctrlKey && !e.altKey ? KEYS[e.key.toLowerCase()] : undefined;
      if (!action) return;
      e.preventDefault();
      latest.current[action]();
    };
    window.addEventListener("keydown", onKey);
    const off = onMenuCommand((cmd) => { const action = MENU[cmd]; if (action) latest.current[action](); });
    return () => { window.removeEventListener("keydown", onKey); off(); };
  }, []);
}
