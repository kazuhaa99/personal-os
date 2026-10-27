import { QueryClient } from "@tanstack/react-query";

/** How long the native apps keep loaded data on the device for offline viewing. */
export const NATIVE_CACHE_MAX_AGE = 7 * 24 * 3600_000;
/** localStorage key of that on-device copy. */
export const DEVICE_CACHE_KEY = "pos.cache";

/**
 * The app's query client. `persist` (native apps): keep unused data as long as the on-device copy
 * lives, and run writes right away even without a connection, so they fail at once instead of
 * TanStack's default of pausing them and sending them later: offline the apps are read-only
 * (see components/native/OfflineBanner). The web keeps the defaults.
 */
export function createQueryClient({ persist = false }: { persist?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1, refetchOnWindowFocus: true, staleTime: 10_000, placeholderData: (prev: unknown) => prev,
        ...(persist ? { gcTime: NATIVE_CACHE_MAX_AGE } : {}),
      },
      ...(persist ? { mutations: { networkMode: "always" as const } } : {}),
    },
  });
}

/** Wipe the on-device copy now (sign-out), instead of waiting for the persister's next write. */
export function clearDeviceCache(): void {
  try {
    localStorage.removeItem(DEVICE_CACHE_KEY);
  } catch {
    /* storage unavailable: nothing was stored either */
  }
}
