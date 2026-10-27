import { useQuery } from "@tanstack/react-query";
import { addDays, format as isoFormat, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { CalendarDays, CheckSquare, CornerDownLeft, Hash, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { relativeDay, todayISO } from "@/lib/format";
import { format, t, tp } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Dashboard, Task } from "@/lib/types";
import { useConfirm } from "@/components/ui/dialog";
import { Button, Card, CardHeader, cn, EmptyState, ErrorBlock, LoadingBlock, Segmented, Select } from "@/components/ui/primitives";
import { useQuickActions } from "@/components/layout/QuickActions";
import { TaskRow } from "./TaskRow";
import { oneOf } from "@/lib/urlParams";
import { viewCounts } from "./viewCounts";

const VIEWS = ["today", "upcoming", "all", "overdue", "completed"] as const;
type View = (typeof VIEWS)[number];
const PRIORITIES = ["", "low", "medium", "high", "urgent"] as const;

const EMPTY: Record<View, [string, string]> = {
  today: ["Nothing due today", "Add something above, or enjoy the free time."],
  upcoming: ["Nothing scheduled ahead", "Tasks with a future due date show up here."],
  all: ["No tasks yet", "Type a task above and press Enter."],
  overdue: ["Nothing overdue", "Everything is on schedule."],
  completed: ["No completed tasks", "Finished tasks are listed here."],
};

/** Inline quick add, styled as the first row of the list. */
function QuickAdd({ dueToday }: { dueToday: boolean }) {
  const [title, setTitle] = useState("");
  const add = useAction((title: string) => api.post("/tasks", { title, due_date: dueToday ? todayISO() : null }), { refresh: ["tasks"],
    success: dueToday ? t("Added for today") : t("Task added"), onSuccess: () => setTitle(""),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate(title.trim()); }}
      className="flex items-center gap-3 px-4 h-12 border-b hairline focus-within:bg-accent/[0.04] transition-colors">
      <Plus className="h-4 w-4 text-accent shrink-0" />
      <input aria-label={t("Quick add task")} placeholder={dueToday ? t("New task for today") : t("New task")} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
        className="flex-1 bg-transparent text-sm outline-none focus-visible:outline-none placeholder:text-ink-3" />
      {title.trim() && <kbd className="inline-flex items-center gap-1 rounded bg-fill/[0.06] px-1.5 py-0.5 text-[11px] text-ink-3"><CornerDownLeft className="h-3 w-3" /> {t("to add")}</kbd>}
    </form>
  );
}

function groupTasks(tasks: Task[], view: View, today: string): [string, Task[], boolean?][] {
  if (view === "completed") return [[t("Completed"), tasks]];
  if (view === "upcoming") {
    const by = new Map<string, Task[]>();
    for (const t of tasks) by.set(t.due_date!, [...(by.get(t.due_date!) ?? []), t]);
    return [...by.entries()].map(([d, ts]) => [`${relativeDay(d, today)} · ${format(parseISO(d), t("d MMM"))}`, ts]);
  }
  const overdue = tasks.filter((t) => t.overdue);
  const dueToday = tasks.filter((t) => !t.overdue && t.due_date === today && t.status !== "done");
  const later = tasks.filter((t) => !t.overdue && t.due_date && t.due_date > today && t.status !== "done");
  const noDate = tasks.filter((t) => !t.due_date && t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  return ([[t("Overdue"), overdue, true], [t("Today"), dueToday], [t("Later"), later], [t("No date"), noDate], [t("Done"), done]] as [string, Task[], boolean?][])
    .filter(([, ts]) => ts.length);
}

function DayRing({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={t("{done} of {total} done today", { done, total })}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="rgb(var(--fill) / 0.08)" strokeWidth="7" />
      <motion.circle cx="38" cy="38" r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth="7" strokeLinecap="round" transform="rotate(-90 38 38)"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      <text x="38" y="43" textAnchor="middle" fontSize="16" fontWeight="600" fill="rgb(var(--ink))">{total ? Math.round(pct * 100) : 0}%</text>
    </svg>
  );
}

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const view = oneOf<View>(params.get("view"), VIEWS, "today");
  const priority = oneOf(params.get("priority"), PRIORITIES, "");
  const category = params.get("category") ?? "";
  const confirm = useConfirm();
  const qa = useQuickActions();
  const today = todayISO();

  const { data: counts } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard"), select: (d) => d.tasks.counts });
  const { data: tasks, isLoading, error, refetch } = useQuery({
    queryKey: ["tasks", view, priority, category],
    queryFn: () => api.get<Task[]>("/tasks", { view, priority, category }),
  });
  const { data: upcoming = [] } = useQuery({ queryKey: ["tasks", "upcoming", "", ""], queryFn: () => api.get<Task[]>("/tasks", { view: "upcoming" }) });
  const { data: all } = useQuery({ queryKey: ["tasks", "all", "", ""], queryFn: () => api.get<Task[]>("/tasks", { view: "all" }) });
  const tabCounts = all ? viewCounts(all, today, { priority, category }) : undefined;
  const clearDone = useAction(async (ids: number[]) => { for (const id of ids) await api.del(`/tasks/${id}`); }, { refresh: ["tasks"], success: t("Completed tasks cleared") });

  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    setParams(n, { replace: true });
  };

  const open = (all ?? []).filter((t) => t.status !== "done");
  const lists = Object.entries(open.reduce<Record<string, number>>((acc, t) => { const k = t.category ?? ""; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const doneToday = counts?.done_today ?? 0;
  const dayTotal = doneToday + (counts?.today ?? 0) + (counts?.overdue ?? 0);
  const week = Array.from({ length: 7 }, (_, i) => isoFormat(addDays(parseISO(today), i + 1), "yyyy-MM-dd"));
  const groups = tasks ? groupTasks(tasks, view, today) : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
      {/* Main list */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={(v) => set({ view: v })} options={[
            { value: "today", label: t("Today"), count: tabCounts?.today },
            { value: "upcoming", label: t("Upcoming"), count: tabCounts?.upcoming },
            { value: "all", label: t("All") },
            { value: "overdue", label: t("Overdue"), count: tabCounts?.overdue },
            { value: "completed", label: t("Completed") },
          ]} />
          <div className="flex gap-2 ml-auto">
            <Select aria-label={t("Priority")} className="w-auto h-8" value={priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">{t("Any priority")}</option><option value="urgent">{t("Urgent")}</option><option value="high">{t("High")}</option><option value="medium">{t("Medium")}</option><option value="low">{t("Low")}</option>
            </Select>
            {category && <Button size="sm" className="h-8" onClick={() => set({ category: "" })}><Hash className="h-3.5 w-3.5" />{category} ×</Button>}
          </div>
        </div>

        <Card className="overflow-hidden">
          {view !== "completed" && <QuickAdd dueToday={view === "today" || view === "overdue"} />}
          {isLoading ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : groups.length === 0 ? (
            <EmptyState className="py-12" icon={<CheckSquare className="h-6 w-6" />} title={t(EMPTY[view][0])} body={t(EMPTY[view][1])} />
          ) : (
            <div className="p-2">
              {groups.map(([label, items, danger]) => (
                <section key={label} className="mb-1 last:mb-0">
                  <h3 className={cn("flex items-center gap-2 px-3 pt-2.5 pb-1 text-xs font-semibold", danger ? "text-bad" : "text-ink-3")}>
                    {label}<span className="font-normal tnum">{items.length}</span>
                  </h3>
                  {items.map((t) => <TaskRow key={t.id} task={t} today={today} />)}
                </section>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-3">{t("Click a task to edit it. Completing a repeating task schedules its next occurrence.")} {t("Shortcut:")} <kbd className="text-ink-2">N</kbd> {t("for a detailed task.")}</p>
          {view === "completed" && !!tasks?.length && (
            <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: tp("Delete {n} completed task?", tasks.length) })) clearDone.mutate(tasks.map((t) => t.id)); }}>
              <Trash2 className="h-3.5 w-3.5" /> {t("Clear completed")}
            </Button>
          )}
        </div>
      </div>

      {/* Context panel */}
      <aside className="space-y-4 lg:sticky lg:top-0">
        <Card>
          <div className="flex items-center gap-4 p-4">
            <DayRing done={doneToday} total={dayTotal} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{format(parseISO(today), t("EEEE, d MMMM"))}</p>
              <p className="text-sm text-ink-2 mt-0.5">{t("{done} of {total} done today", { done: doneToday, total: dayTotal })}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 border-t hairline divide-x divide-line/[0.08] text-center">
            {[
              { v: "overdue" as View, label: t("Overdue"), n: counts?.overdue ?? 0, tone: (counts?.overdue ?? 0) > 0 ? "text-bad" : "" },
              { v: "today" as View, label: t("Due today"), n: counts?.today ?? 0, tone: "" },
              { v: "upcoming" as View, label: t("Next 7 days"), n: counts?.upcoming_7d ?? 0, tone: "" },
            ].map((x) => (
              <button key={x.v} onClick={() => set({ view: x.v })} className={cn("py-3 hover:bg-fill/[0.04] transition-colors", view === x.v && "bg-accent/[0.06]")}>
                <span className={cn("block text-lg font-semibold tnum", x.tone)}>{x.n}</span>
                <span className="text-xs text-ink-3">{x.label}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-accent" />{t("Next 7 days")}</span>} className="pb-2" />
          <ul className="px-2 pb-2">
            {week.map((d) => {
              const items = upcoming.filter((t) => t.due_date === d);
              return (
                <li key={d} className="flex gap-3 rounded-lg px-3 py-1.5 hover:bg-fill/[0.03]">
                  <span className="w-[72px] shrink-0 text-xs font-medium text-ink-2 pt-0.5">{relativeDay(d, today)}</span>
                  <span className="min-w-0 flex-1 text-[13px]">
                    {items.length === 0 ? <span className="text-ink-3">—</span> : items.slice(0, 3).map((t) => (
                      <button key={t.id} onClick={() => qa.editTask(t)} className="block w-full truncate text-left hover:text-accent">{t.title}</button>
                    ))}
                    {items.length > 3 && <span className="text-xs text-ink-3">{t("+{n} more", { n: items.length - 3 })}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        {lists.length > 0 && (
          <Card>
            <CardHeader title={t("Lists")} subtitle={t("Open tasks by category")} className="pb-2" />
            <ul className="px-2 pb-2">
              {lists.map(([name, n]) => (
                <li key={name || "none"}>
                  <button disabled={!name} onClick={() => set({ category: category === name ? "" : name, view: "all" })}
                    className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors enabled:hover:bg-fill/[0.04]", category === name && name && "bg-accent/10 text-accent")}>
                    <Hash className="h-3.5 w-3.5 text-ink-3" />
                    <span className="flex-1 truncate">{name || t("No category")}</span>
                    <span className="text-xs text-ink-3 tnum">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
