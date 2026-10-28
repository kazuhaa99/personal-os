import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "@/lib/i18n";

// After an update the old page files are gone from the server, so a tab or app opened before it
// fails to load the next page. One automatic reload fetches the new version; if that doesn't
// help (or the error is something else), say so and offer a reload instead of a blank screen.
const RELOADED_KEY = "pos.reloaded-for-update";
const RELOAD_WINDOW_MS = 60_000;

function isLoadFailure(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Loading chunk/i.test(error.message);
}

function reloadedRecently(): boolean {
  try { return Date.now() - Number(sessionStorage.getItem(RELOADED_KEY) ?? 0) < RELOAD_WINDOW_MS; } catch { return true; }
}

interface Props { children: ReactNode; reload?: () => void }

export class LoadErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("page failed to render", error, info.componentStack);
    if (isLoadFailure(error) && !reloadedRecently()) {
      try { sessionStorage.setItem(RELOADED_KEY, String(Date.now())); } catch { /* reload anyway */ }
      this.reload();
    }
  }

  private reload = (): void => (this.props.reload ?? (() => window.location.reload()))();

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid place-items-center gap-3 py-24 text-center text-sm text-ink-2">
        <p>{t("This page couldn't load. Reloading usually fixes it.")}</p>
        <button type="button" className="text-accent underline" onClick={this.reload}>{t("Reload")}</button>
      </div>
    );
  }
}
