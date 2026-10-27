import type { Task } from "@/lib/types";

export interface ViewFilter { priority: string; category: string }

/** Open tasks per tab, with the page's filters: the same rules as GET /tasks?view=… (services/tasks.py). */
export function viewCounts(all: Task[], today: string, filter: ViewFilter): { today: number; upcoming: number; overdue: number } {
  const open = all.filter((t) => t.status !== "done"
    && (!filter.priority || t.priority === filter.priority)
    && (!filter.category || (t.category ?? "").toLowerCase() === filter.category.toLowerCase()));
  const due = (t: Task) => t.due_date ?? "";
  return {
    today: open.filter((t) => t.due_date && due(t) <= today).length,
    upcoming: open.filter((t) => t.due_date && due(t) > today).length,
    overdue: open.filter((t) => t.due_date && due(t) < today).length,
  };
}
