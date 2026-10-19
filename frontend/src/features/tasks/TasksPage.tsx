import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { useAction } from "@/lib/queries";
import type { Dashboard, Task } from "@/lib/types";
import { useConfirm } from "@/components/ui/dialog";
import { Button, Card, EmptyState, ErrorBlock, Input, LoadingBlock, Segmented, Select } from "@/components/ui/primitives";
import { TaskRow } from "./TaskRow";

type View = "today" | "upcoming" | "all" | "overdue" | "completed";

function QuickAdd() {
  const [title, setTitle] = useState("");
  const add = useAction((t: string) => api.post("/tasks", { title: t, due_date: todayISO() }), { success: "Added for today", onSuccess: () => setTitle("") });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate(title.trim()); }} className="flex gap-2">
      <Input aria-label="Quick add task" placeholder="Add a task for today and press Enter…" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <Button type="submit" variant="primary" disabled={!title.trim()} loading={add.isPending}>Add</Button>
    </form>
  );
}

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) ?? "today";
  const priority = params.get("priority") ?? "";
  const category = params.get("category") ?? "";
  const confirm = useConfirm();
  const today = todayISO();

  const { data: counts } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard"), select: (d) => d.tasks.counts });
  const { data: categories = [] } = useQuery({ queryKey: ["task-categories"], queryFn: () => api.get<string[]>("/tasks/categories") });
  const { data: tasks, isLoading, error, refetch } = useQuery({
    queryKey: ["tasks", view, priority, category],
    queryFn: () => api.get<Task[]>("/tasks", { view, priority, category }),
  });
  const clearDone = useAction(async (ids: number[]) => { for (const id of ids) await api.del(`/tasks/${id}`); }, { success: "Completed tasks cleared" });

  const set = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };

  const overdue = (tasks ?? []).filter((t) => t.overdue);
  const rest = (tasks ?? []).filter((t) => !t.overdue);

  return (
    <div className="space-y-5 max-w-4xl">
      <QuickAdd />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={(v) => set("view", v)} options={[
          { value: "today", label: "Today", count: counts ? counts.today + counts.overdue : undefined },
          { value: "upcoming", label: "Upcoming", count: counts?.upcoming_7d },
          { value: "all", label: "All" },
          { value: "overdue", label: "Overdue", count: counts?.overdue },
          { value: "completed", label: "Completed" },
        ]} />
        <div className="flex gap-2 ml-auto">
          <Select aria-label="Priority" className="w-auto" value={priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="">Any priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </Select>
          {categories.length > 0 && (
            <Select aria-label="Category" className="w-auto" value={category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Any category</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
        </div>
      </div>

      <Card className="p-2">
        {isLoading ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : !tasks?.length ? (
          <EmptyState icon={<CheckSquare className="h-6 w-6" />}
            title={{ today: "Nothing due today", upcoming: "Nothing scheduled ahead", all: "No tasks yet", overdue: "Nothing overdue", completed: "No completed tasks" }[view]}
            body={view === "today" ? "Add something above, or enjoy the free time." : undefined} />
        ) : view === "today" && overdue.length > 0 ? (
          <>
            <p className="px-3 pt-2 pb-1 text-2xs uppercase tracking-wider text-[#f07a7a]">Overdue · {overdue.length}</p>
            {overdue.map((t) => <TaskRow key={t.id} task={t} today={today} />)}
            {rest.length > 0 && <p className="px-3 pt-3 pb-1 text-2xs uppercase tracking-wider text-ink-3">Today</p>}
            {rest.map((t) => <TaskRow key={t.id} task={t} today={today} />)}
          </>
        ) : (
          tasks.map((t) => <TaskRow key={t.id} task={t} today={today} />)
        )}
      </Card>
      {view === "completed" && !!tasks?.length && (
        <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Delete ${tasks.length} completed task(s)?` })) clearDone.mutate(tasks.map((t) => t.id)); }}>
          <Trash2 className="h-3.5 w-3.5" /> Clear completed
        </Button>
      )}
      <p className="text-xs text-ink-3">Click a task to edit it. Completing a repeating task schedules its next occurrence.</p>
    </div>
  );
}
