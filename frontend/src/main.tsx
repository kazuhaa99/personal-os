import { QueryClientProvider } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import React, { useEffect, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./App";
import { BiometricLock } from "./components/native/BiometricLock";
import { OfflineBanner } from "./components/native/OfflineBanner";
import { ConfirmProvider } from "./components/ui/dialog";
import { LangProvider } from "./lib/i18n";
import { createQueryClient, DEVICE_CACHE_KEY, NATIVE_CACHE_MAX_AGE } from "./lib/queryClient";
import { ThemeProvider, useTheme } from "./lib/theme";
import { asset, BASE } from "./lib/base";
import { IS_NATIVE, PLATFORM } from "./platform";
import { setStatusBar } from "./platform/native";
import "@fontsource-variable/inter";
import "./index.css";

if (IS_NATIVE) {
  // The shells bundle the static files themselves: no service worker. CSS hooks for native-only tweaks.
  document.documentElement.classList.add("native", `native-${PLATFORM}`);
} else if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // PWA: static-only service worker (public/sw.js). Production only, so it never shadows Vite's dev server.
  // Scoped to our own path: under a shared domain it must never control the host site's other pages.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(asset("sw.js"), { scope: BASE }).catch(() => undefined);
  });
}

const queryClient = createQueryClient({ persist: IS_NATIVE });
const persister = IS_NATIVE ? createSyncStoragePersister({ storage: window.localStorage, key: DEVICE_CACHE_KEY }) : null;

/** Native apps keep the last loaded data on the device, so they can show it (read-only) offline. */
function DataProvider({ children }: { children: ReactNode }) {
  if (!persister) return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: NATIVE_CACHE_MAX_AGE, buster: "1" }}>
      {children}
    </PersistQueryClientProvider>
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" toastOptions={{ className: "!mat-popover !rounded-xl !text-ink" }} />;
}

/** iOS status bar text / macOS title bar follow the app's light or dark theme. */
function NativeChrome() {
  const { resolved } = useTheme();
  useEffect(() => { if (IS_NATIVE) void setStatusBar(resolved); }, [resolved]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
    <DataProvider>
    <LangProvider>
      <BrowserRouter basename={BASE}>
        <ConfirmProvider>
          <BiometricLock>
            <App />
          </BiometricLock>
        </ConfirmProvider>
        <ThemedToaster />
        <OfflineBanner />
        <NativeChrome />
      </BrowserRouter>
    </LangProvider>
    </DataProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
