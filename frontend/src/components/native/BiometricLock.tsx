import { Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { IS_NATIVE } from "@/platform";
import { biometricStatus, biometricVerify, onAppStateChange } from "@/platform/native";
import { Button } from "@/components/ui/primitives";

const KEY = "pos.biometricLock";
const CHANGED = "pos-biometric-lock";
/** Back from the background after this long: ask again. */
const RELOCK_AFTER_MS = 60_000;

export function biometricLockEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setBiometricLockEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable: the lock stays as it was */
  }
  window.dispatchEvent(new Event(CHANGED));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
};

/**
 * Optional Face ID / Touch ID lock over the whole app (native apps only, off by default).
 * The app stays mounted underneath (an open form survives) but is inert while covered. The cover
 * also goes up whenever the app is in the background, so the app switcher's snapshot shows nothing.
 */
export function BiometricLock({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, biometricLockEnabled) && IS_NATIVE;
  const [state, setState] = useState<"checking" | "locked" | "open">(enabled ? "checking" : "open");
  const [background, setBackground] = useState(false);
  const asking = useRef(false);

  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      setState((await biometricVerify(t("Unlock Personal OS"))) ? "open" : "locked");
    } finally {
      asking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || state !== "checking") return;
    let cancelled = false;
    biometricStatus().then((s) => {
      if (cancelled) return;
      if (s.available) void unlock();
      else setState("open"); // biometrics removed or never set up: don't lock the owner out
    });
    return () => { cancelled = true; };
  }, [enabled, state, unlock]);

  useEffect(() => {
    if (!enabled) { setBackground(false); return; }
    let hiddenAt = 0;
    return onAppStateChange((active) => {
      setBackground(!active);
      if (!active) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) {
        setState("locked");
        void unlock();
      }
    });
  }, [enabled, unlock]);

  const covered = enabled && (state !== "open" || background);
  return (
    <>
      <div {...(covered ? { inert: "", "aria-hidden": true } : {})}>{children}</div>
      {covered && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[rgb(var(--bg))] p-6 text-center">
          {!background && (
            <div className="flex flex-col items-center gap-4">
              <Lock className="h-8 w-8 text-ink-3" aria-hidden />
              <p className="text-sm text-ink-2">{t("Personal OS is locked")}</p>
              <Button onClick={() => void unlock()}>{t("Unlock")}</Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
