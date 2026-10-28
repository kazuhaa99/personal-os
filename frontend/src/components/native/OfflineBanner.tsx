import { onlineManager } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";

/** While offline: say so, and that what's shown is the saved copy and changes are off. */
export function OfflineBanner() {
  const online = useSyncExternalStore((cb) => onlineManager.subscribe(cb), () => onlineManager.isOnline());
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-[calc(var(--sat)+0.5rem)] z-[60] mx-auto w-fit max-w-[calc(100%-1.5rem)] mat-popover rounded-full px-4 py-2 text-xs text-ink-2 shadow-lg flex items-center gap-2">
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t("No connection to the server. Showing saved data; changes are off until it's back.")}</span>
    </div>
  );
}
