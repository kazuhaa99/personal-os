import { Check, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, relativeDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { Badge, cn, DemoBadge } from "@/components/ui/primitives";
import { useQuickActions } from "@/components/layout/QuickActions";

const PRIORITY_DOT: Record<Task["priority"], string> = {
  urgent: "bg-bad", high: "bg-warn", medium: "bg-accent/70", low: "bg-fill/20",
};
const PRIORITY_NAME: Record<Task["priority"], string> = {
  urgent: "Urgent priority", high: "High priority", medium: "Medium priority", low: "Low priority",
};
const RECURRENCE_NAME: Record<Task["recurrence"], string> = {
  none: "Never", daily: "Daily", weekdays: "Weekdays", weekly: "Weekly", monthly: "Monthly",
};

export function TaskCheck({ task }: { task: Task }) {
  const toggle = useAction(
    () => api.post<{ next_instance: Task | null }>(`/tasks/${task.id}/${task.status === "done" ? "reopen" : "complete"}`),
    { refresh: ["tasks"], success: (r: unknown) => {
      const res = r as { next_instance?: Task | null };
      return task.status === "done" ? t("Task reopened") : res?.next_instance ? t("Done · next on {date}", { date: fmtDate(res.next_instance.due_date, t("d MMM")) }) : t("Done");
    } },
  );
  const done = task.status === "done";
  return (
    <button
      type="button"
      aria-label={done ? t("Reopen {title}", { title: task.title }) : t("Complete {title}", { title: task.title })}
      onClick={() => toggle.mutate(undefined)}
      disabled={toggle.isPending}
      className={cn(
        "mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border grid place-items-center transition-colors",
        done ? "bg-accent border-accent text-accent-ink" : "border-ink-3/50 hover:border-accent",
      )}
    >
      {done && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

export function TaskRow({ task, today, compact }: { task: Task; today: string; compact?: boolean }) {
  const qa = useQuickActions();
  const done = task.status === "done";
  return (
    <div className={cn("group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-fill/[0.03]", compact && "py-2")}>
      <TaskCheck task={task} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => qa.editTask(task)}>
        <p className={cn("text-sm leading-5 truncate", done && "line-through text-ink-3")}>
          {task.title}
          <DemoBadge show={task.is_demo} />
        </p>
        {!compact && task.description && <p className="text-xs text-ink-3 truncate mt-0.5">{task.description}</p>}
      </button>
      <div className="flex items-center gap-2 shrink-0 text-xs">
        {task.recurrence !== "none" && <Repeat className="h-3.5 w-3.5 text-ink-3" aria-label={t("Repeats: {rule}", { rule: t(RECURRENCE_NAME[task.recurrence]) })} />}
        {task.category && !compact && <Badge>{task.category}</Badge>}
        {task.due_date && (
          <span className={cn("tnum", task.overdue ? "text-bad" : "text-ink-3")}>
            {relativeDay(task.due_date, today)}{task.due_time ? ` ${task.due_time.slice(0, 5)}` : ""}
          </span>
        )}
        <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[task.priority])} title={t(PRIORITY_NAME[task.priority])} aria-label={t(PRIORITY_NAME[task.priority])} />
      </div>
    </div>
  );
}
