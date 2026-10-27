// The few things only the native shells can do, behind one small bridge: iOS through Capacitor
// plugins, macOS through the Tauri shell (commands and events defined in src-tauri). On the web
// every call is a harmless no-op, so callers never need to check the platform themselves.

import { PLATFORM } from "./index";

export interface BiometricStatus {
  available: boolean;
  kind: "face" | "touch" | "other" | null;
}

interface Bridge {
  haptic(kind: "light" | "success"): Promise<void>;
  setStatusBar(theme: "light" | "dark"): Promise<void>;
  biometricStatus(): Promise<BiometricStatus>;
  biometricVerify(reason: string): Promise<boolean>;
  /** Called with false when the app goes to the background, true when it comes back. */
  onAppStateChange(cb: (active: boolean) => void): () => void;
  /** Commands from the macOS app menu ("new", "search", "settings"). */
  onMenuCommand(cb: (command: string) => void): () => void;
}

const noop = () => {};

const web: Bridge = {
  haptic: async () => {},
  setStatusBar: async () => {},
  biometricStatus: async () => ({ available: false, kind: null }),
  biometricVerify: async () => false,
  onAppStateChange: () => noop,
  onMenuCommand: () => noop,
};

/** Subscribe to a listener that is only available asynchronously; safe to cancel before it resolves. */
function lazyListener(attach: () => Promise<() => void>): () => void {
  let detach: (() => void) | null = null;
  let cancelled = false;
  attach().then((d) => (cancelled ? d() : (detach = d))).catch(noop);
  return () => { cancelled = true; detach?.(); };
}

const ios: Bridge = {
  async haptic(kind) {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: ImpactStyle.Light });
  },
  async setStatusBar(theme) {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = light text, for a dark background.
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  },
  async biometricStatus() {
    const { BiometricAuth, BiometryType } = await import("@aparajita/capacitor-biometric-auth");
    const r = await BiometricAuth.checkBiometry();
    if (!r.isAvailable) return { available: false, kind: null };
    return { available: true, kind: r.biometryType === BiometryType.faceId ? "face" : r.biometryType === BiometryType.touchId ? "touch" : "other" };
  },
  async biometricVerify(reason) {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    try {
      await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
      return true;
    } catch {
      return false; // cancelled or not recognised
    }
  },
  onAppStateChange: (cb) => lazyListener(async () => {
    const { App } = await import("@capacitor/app");
    const handle = await App.addListener("appStateChange", (s) => cb(s.isActive));
    return () => void handle.remove();
  }),
  onMenuCommand: () => noop,
};

const macos: Bridge = {
  haptic: async () => {},
  async setStatusBar(theme) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(theme); // title bar and traffic lights follow the app's theme
  },
  biometricStatus: async () => (await import("@tauri-apps/api/core")).invoke<BiometricStatus>("biometric_status"),
  biometricVerify: async (reason) => (await import("@tauri-apps/api/core")).invoke<boolean>("biometric_verify", { reason }),
  // The window losing focus (another app, hidden, minimised) counts as "in the background".
  onAppStateChange: (cb) => lazyListener(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => cb(focused));
  }),
  onMenuCommand: (cb) => lazyListener(async () => {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<string>("menu", (e) => cb(e.payload));
  }),
};

let testBridge: Partial<Bridge> | null = null;

/** Replace parts of the bridge with test doubles (unit tests only). */
export function useNativeForTests(bridge: Partial<Bridge> | null): void {
  testBridge = bridge;
}

function bridge(): Bridge {
  const real = PLATFORM === "ios" ? ios : PLATFORM === "macos" ? macos : web;
  return testBridge ? { ...real, ...testBridge } : real;
}

export const haptic = (kind: "light" | "success" = "light"): Promise<void> => bridge().haptic(kind).catch(noop);
export const setStatusBar = (theme: "light" | "dark"): Promise<void> => bridge().setStatusBar(theme).catch(noop);
export const biometricStatus = (): Promise<BiometricStatus> =>
  bridge().biometricStatus().catch((): BiometricStatus => ({ available: false, kind: null }));
export const biometricVerify = (reason: string): Promise<boolean> => bridge().biometricVerify(reason).catch(() => false);
export const onAppStateChange = (cb: (active: boolean) => void): (() => void) => bridge().onAppStateChange(cb);
export const onMenuCommand = (cb: (command: string) => void): (() => void) => bridge().onMenuCommand(cb);
