import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadErrorBoundary } from "./LoadErrorBoundary";

function Throws({ error }: { error: Error }): JSX.Element {
  throw error;
}

const chunkError = () => new TypeError("Failed to fetch dynamically imported module: /assets/TasksPage-abc.js");

describe("LoadErrorBoundary", () => {
  afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

  it("reloads once when a page's code is gone after an update", () => {
    const reload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<LoadErrorBoundary reload={reload}><Throws error={chunkError()} /></LoadErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("offers a reload button instead of looping when reloading didn't help", () => {
    const reload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    sessionStorage.setItem("pos.reloaded-for-update", String(Date.now()));
    render(<LoadErrorBoundary reload={reload}><Throws error={chunkError()} /></LoadErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't load");
    screen.getByRole("button", { name: "Reload" }).click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows other errors with a reload button and doesn't reload by itself", () => {
    const reload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<LoadErrorBoundary reload={reload}><Throws error={new Error("boom")} /></LoadErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
