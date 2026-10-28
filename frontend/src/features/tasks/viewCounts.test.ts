import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { viewCounts } from "./viewCounts";

const task = (id: number, due: string | null, extra: Partial<Task> = {}) =>
  ({ id, due_date: due, status: "todo", priority: "medium", category: null, ...extra }) as Task;

describe("viewCounts: each tab's number is the length of the list it opens", () => {
  const today = "2026-10-27";
  const all = [
    task(1, "2026-10-20"), task(2, today), task(3, today, { status: "done" }),
    task(4, "2026-10-28"), task(5, "2026-12-01"), task(6, null),
    task(7, today, { priority: "urgent", category: "Work" }),
  ];

  it("counts what the server lists for today, upcoming and overdue", () => {
    // today = due today or earlier (overdue included); upcoming = every later date, not just a week
    expect(viewCounts(all, today, { priority: "", category: "" })).toEqual({ today: 3, upcoming: 2, overdue: 1 });
  });

  it("applies the same priority and list filters as the list", () => {
    expect(viewCounts(all, today, { priority: "urgent", category: "" })).toEqual({ today: 1, upcoming: 0, overdue: 0 });
    expect(viewCounts(all, today, { priority: "", category: "work" })).toEqual({ today: 1, upcoming: 0, overdue: 0 });
  });
});
