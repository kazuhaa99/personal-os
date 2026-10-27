// Small secrets (the native refresh token) in the OS keychain: iOS Keychain through the Capacitor
// secure-storage plugin, macOS Keychain through the Tauri shell's own commands
// (secure_get / secure_set / secure_remove, see src-tauri). The web has no use for it.

import { PLATFORM } from "./index";

export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

let testStore: SecureStore | null = null;

/** Replace the keychain with an in-memory store (unit tests only). */
export function useSecureStoreForTests(store: SecureStore | null): void {
  testStore = store;
}

async function iosStore(): Promise<SecureStore> {
  const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
  return {
    get: async (key) => {
      const v = await SecureStorage.get(key, false);
      return typeof v === "string" ? v : null;
    },
    set: (key, value) => SecureStorage.set(key, value, false),
    remove: async (key) => { await SecureStorage.remove(key); },
  };
}

async function macStore(): Promise<SecureStore> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    get: (key) => invoke<string | null>("secure_get", { key }),
    set: (key, value) => invoke<void>("secure_set", { key, value }),
    remove: (key) => invoke<void>("secure_remove", { key }),
  };
}

let native: Promise<SecureStore> | null = null;

export function secureStore(): Promise<SecureStore> {
  if (testStore) return Promise.resolve(testStore);
  if (PLATFORM === "web") return Promise.reject(new Error("No keychain on the web"));
  native ??= PLATFORM === "ios" ? iosStore() : macStore();
  return native;
}
