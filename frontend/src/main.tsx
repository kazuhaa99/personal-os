import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./App";
import { ConfirmProvider } from "./components/ui/dialog";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000, placeholderData: (prev: unknown) => prev } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
        <Toaster theme="dark" position="bottom-right" toastOptions={{ className: "!bg-raised !border-white/10 !text-ink" }} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
