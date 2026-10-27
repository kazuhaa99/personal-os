import { AlertOctagon, AlertTriangle, ChevronRight, Info, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction } from "@/lib/queries";
import { t } from "@/lib/i18n";
import type { Insight } from "@/lib/types";
import { Badge, Button, cn, EmptyState } from "@/components/ui/primitives";

const ICONS = {
  critical: { icon: AlertOctagon, cls: "text-bad", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "text-warn", label: "Warning" },
  info: { icon: Info, cls: "text-accent", label: "Info" },
};

export function InsightList({ items, limit }: { items: Insight[]; limit?: number }) {
  const dismiss = useAction((key: string) => api.post(`/insights/${encodeURIComponent(key)}/dismiss`), { refresh: ["insights"], success: t("Dismissed") });
  if (!items.length) {
    return <EmptyState className="py-6" title={t("Nothing needs attention")} body={t("Alerts appear here when a budget runs over, a payment is due, or a task or goal slips.")} />;
  }
  return (
    <ul className="divide-y divide-line/[0.08]">
      {items.slice(0, limit).map((i) => {
        const { icon: Icon, cls, label } = ICONS[i.severity];
        const Body = (
          <>
            <p className="text-sm text-ink leading-5">{i.title}</p>
            <p className="text-xs text-ink-3 mt-0.5 leading-relaxed">{i.explanation}</p>
            {i.estimate && <Badge className="mt-1.5">{t("projection")}</Badge>}
          </>
        );
        return (
          <li key={i.key} className="group flex items-start gap-3 px-5 py-3">
            <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", cls)} aria-label={t(label)} />
            {i.link ? (
              <Link to={i.link} className="min-w-0 flex-1 hover:opacity-90">{Body}</Link>
            ) : (
              <div className="min-w-0 flex-1">{Body}</div>
            )}
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 sm:opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={t("Dismiss")} onClick={() => dismiss.mutate(i.key)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              {i.link && <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
