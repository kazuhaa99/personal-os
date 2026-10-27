import { QueryClient } from "@tanstack/react-query";

/** How long the native apps keep loaded data on the device for offline viewing. */
export const NATIVE_CACHE_MAX_AGE = 7 * 24 * 3600_000;

/**
 * The app's query client. Writes run (and fail) right away even without a connection instead of
 * TanStack's default of pausing them until it returns: nothing is ever written behind the user's
 * back later. Offline the app is read-only (see components/native/OfflineBanner).
 * `persist`: keep unused data around as long as the on-device copy lives (native apps).
 */
export function createQueryClient({ persist = false }: { persist?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1, refetchOnWindowFocus: true, staleTime: 10_000, placeholderData: (prev: unknown) => prev,
        ...(persist ? { gcTime: NATIVE_CACHE_MAX_AGE } : {}),
      },
      mutations: { networkMode: "always" },
    },
  });
}
