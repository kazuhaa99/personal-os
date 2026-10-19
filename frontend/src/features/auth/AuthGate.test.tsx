import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { AuthGate, useAuth } from "./AuthGate";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function Home() {
  const { logout } = useAuth();
  return <button onClick={() => void logout()}>sign-out</button>;
}

describe("AuthGate", () => {
  let session = true;
  beforeEach(() => {
    session = true;
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/auth/me")) return json({ authenticated: session, username: session ? "me" : null, auth_enabled: true });
      if (url.startsWith("/api/auth/logout") && init?.method === "POST") { session = false; return new Response(null, { status: 204 }); }
      return json({ detail: "Sign in required" }, 401);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns to the login page after sign-out", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider><QueryClientProvider client={qc}><LangProvider>
        <AuthGate><Home /></AuthGate>
      </LangProvider></QueryClientProvider></ThemeProvider>,
    );
    fireEvent.click(await screen.findByText("sign-out"));
    await waitFor(() => expect(screen.queryByText("sign-out")).toBeNull(), { timeout: 3000 });
    await waitFor(() => expect(document.querySelector('input[type="password"]')).not.toBeNull(), { timeout: 3000 });
  });
});
