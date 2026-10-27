import type { QueryKey } from "@tanstack/react-query";

// What a successful write makes stale, by area. Areas are connected (a transaction moves balances,
// budgets, analytics and the overview), so each lists every view that shows its data; refreshing
// only those keeps a click to a few requests instead of every query on the page.
export type Area = "finance" | "tasks" | "habits" | "goals" | "profile" | "insights" | "everything";

const VIEWS: Record<Exclude<Area, "everything">, readonly string[]> = {
  finance: ["transactions", "accounts", "categories", "budgets", "recurring", "expected", "installments", "analytics", "dashboard", "palette-tx"],
  tasks: ["tasks", "task-categories", "palette-tasks", "goals", "projects", "dashboard"],
  habits: ["habits", "dashboard"],
  goals: ["goals", "projects", "tasks", "dashboard"],
  profile: ["profile", "analytics", "dashboard"],
  insights: ["dashboard"],
};

/** A query-key predicate: does a write in `areas` make this query stale? The sign-in state never is. */
export function affects(areas: readonly Area[]): (queryKey: QueryKey) => boolean {
  if (areas.includes("everything")) return (key) => key[0] !== "auth";
  const roots = new Set(areas.flatMap((a) => VIEWS[a as Exclude<Area, "everything">]));
  return (key) => typeof key[0] === "string" && roots.has(key[0]);
}
