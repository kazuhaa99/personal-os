import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Fresh modules for a given shell, with the native bridge replaced by test doubles. */
async function shell(platform: "ios" | "macos" | "web", bridge: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_PLATFORM", platform === "web" ? "" : platform);
  const native = await import("./native");
  native.useNativeForTests(bridge);
  return native;
}

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
  act(() => onlineManager.setOnline(true));
});

describe("offline", () => {
  it("shows a read-only banner while the server can't be reached", async () => {
    const { OfflineBanner } = await import("@/components/native/OfflineBanner");
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole("status")).toHaveTextContent(/no connection to the server/i);
    act(() => onlineManager.setOnline(true));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never queues writes for later: a change made offline fails at once", async () => {
    const { createQueryClient } = await import("@/lib/queryClient");
    const client = createQueryClient();
    act(() => onlineManager.setOnline(false));
    const save = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const mutation = client.getMutationCache().build(client, { mutationFn: save, retry: false });
    await expect(mutation.execute(undefined)).rejects.toThrow();
    expect(save).toHaveBeenCalledTimes(1);
    expect(mutation.state.isPaused).toBe(false);
  });
});

describe("Face ID / Touch ID lock", () => {
  beforeEach(() => localStorage.setItem("pos.biometricLock", "1"));

  it("covers the app until the owner is recognised", async () => {
    const verify = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await shell("ios", { biometricStatus: async () => ({ available: true, kind: "face" }), biometricVerify: verify });
    const { BiometricLock } = await import("@/components/native/BiometricLock");
    render(<BiometricLock><p>private data</p></BiometricLock>);
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("private data")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await waitFor(() => expect(screen.getByText("private data")).toBeInTheDocument());
  });

  it("stays out of the way when it is off, on the web, or without biometrics", async () => {
    const verify = vi.fn();
    for (const [platform, available, on] of [["ios", true, false], ["web", true, true], ["ios", false, true]] as const) {
      localStorage.setItem("pos.biometricLock", on ? "1" : "0");
      await shell(platform, { biometricStatus: async () => ({ available, kind: available ? "face" : null }), biometricVerify: verify });
      const { BiometricLock } = await import("@/components/native/BiometricLock");
      const { unmount } = render(<BiometricLock><p>private data</p></BiometricLock>);
      await waitFor(() => expect(screen.getByText("private data")).toBeInTheDocument());
      unmount();
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it("locks again when the app comes back after a while", async () => {
    let resume: () => void = () => {};
    const verify = vi.fn().mockResolvedValue(true);
    await shell("ios", {
      biometricStatus: async () => ({ available: true, kind: "face" }),
      biometricVerify: verify,
      onAppStateChange: (cb: (active: boolean) => void) => { resume = () => { cb(false); vi.advanceTimersByTime(61_000); cb(true); }; return () => {}; },
    });
    const { BiometricLock } = await import("@/components/native/BiometricLock");
    render(<BiometricLock><p>private data</p></BiometricLock>);
    await waitFor(() => expect(screen.getByText("private data")).toBeInTheDocument());
    vi.useFakeTimers({ toFake: ["Date"] });
    act(() => resume());
    vi.useRealTimers();
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
  });
});

describe("Mac keyboard shortcuts", () => {
  async function mount(platform: "macos" | "web") {
    const handlers = { newItem: vi.fn(), search: vi.fn(), settings: vi.fn() };
    let menu: (cmd: string) => void = () => {};
    await shell(platform, { onMenuCommand: (cb: (cmd: string) => void) => { menu = cb; return () => {}; } });
    const { useMacShortcuts } = await import("./shortcuts");
    function Probe() { useMacShortcuts(handlers); return null; }
    render(<Probe />);
    return { handlers, menu: (cmd: string) => menu(cmd) };
  }

  it("maps Cmd+N, Cmd+F and Cmd+, (and the app menu) to the app's actions", async () => {
    const { handlers, menu } = await mount("macos");
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    expect(handlers.newItem).toHaveBeenCalledTimes(1);
    expect(handlers.search).toHaveBeenCalledTimes(1);
    expect(handlers.settings).toHaveBeenCalledTimes(1);
    act(() => menu("new"));
    expect(handlers.newItem).toHaveBeenCalledTimes(2);
  });

  it("leaves the browser's own shortcuts alone on the web", async () => {
    const { handlers } = await mount("web");
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(handlers.newItem).not.toHaveBeenCalled();
    expect(handlers.search).not.toHaveBeenCalled();
  });
});
