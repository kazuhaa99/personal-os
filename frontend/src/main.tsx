import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./App";
import { ConfirmProvider } from "./components/ui/dialog";
import { LangProvider } from "./lib/i18n";
import { ThemeProvider, useTheme } from "./lib/theme";
import "@fontsource-variable/inter";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000, placeholderData: (prev: unknown) => prev } },
});

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" toastOptions={{ className: "!mat-popover !rounded-xl !text-ink" }} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
    <LangProvider>
      <BrowserRouter>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
        <ThemedToaster />
      </BrowserRouter>
    </LangProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
