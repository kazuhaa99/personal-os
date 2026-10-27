import { Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { IS_NATIVE } from "@/platform";
import { biometricStatus, biometricVerify, onAppStateChange } from "@/platform/native";
import { Button } from "@/components/ui/primitives";

const KEY = "pos.biometricLock";
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
}

/** Optional Face ID / Touch ID lock over the whole app (native apps only, off by default). */
export function BiometricLock({ children }: { children: ReactNode }) {
  const enabled = IS_NATIVE && biometricLockEnabled();
  const [state, setState] = useState<"checking" | "locked" | "open">(enabled ? "checking" : "open");
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
    if (!enabled) return;
    let cancelled = false;
    biometricStatus().then((s) => {
      if (cancelled) return;
      if (s.available) void unlock();
      else setState("open"); // biometrics removed or never set up: don't lock the owner out
    });
    return () => { cancelled = true; };
  }, [enabled, unlock]);

  useEffect(() => {
    if (!enabled) return;
    let hiddenAt = 0;
    return onAppStateChange((active) => {
      if (!active) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) {
        setState("locked");
        void unlock();
      }
    });
  }, [enabled, unlock]);

  if (state === "open") return <>{children}</>;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[rgb(var(--bg))] p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <Lock className="h-8 w-8 text-ink-3" aria-hidden />
        <p className="text-sm text-ink-2">{t("Personal OS is locked")}</p>
        <Button onClick={() => void unlock()}>{t("Unlock")}</Button>
      </div>
    </div>
  );
}
