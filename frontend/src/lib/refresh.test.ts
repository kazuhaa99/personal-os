import { describe, expect, it } from "vitest";
import { affects } from "./refresh";

describe("affects: which cached queries an action in an area makes stale", () => {
  it("a finance change refreshes money views and the overview, not tasks or habits", () => {
    const stale = affects(["finance"]);
    for (const key of ["transactions", "accounts", "budgets", "recurring", "expected", "installments", "analytics", "dashboard"]) {
      expect(stale([key])).toBe(true);
    }
    for (const key of ["tasks", "habits", "goals", "settings", "auth"]) expect(stale([key])).toBe(false);
  });

  it("a task change refreshes tasks and what shows task progress", () => {
    const stale = affects(["tasks"]);
    expect(["tasks", "task-categories", "palette-tasks", "goals", "projects", "dashboard"].every((k) => stale([k]))).toBe(true);
    expect(stale(["transactions"])).toBe(false);
  });

  it("everything refreshes all but the sign-in state", () => {
    const stale = affects(["everything"]);
    expect(stale(["habits"]) && stale(["transactions"]) && stale(["settings"])).toBe(true);
    expect(stale(["auth", "me"])).toBe(false);
  });

  it("combines areas", () => {
    const stale = affects(["habits", "goals"]);
    expect(stale(["habits"]) && stale(["goals"]) && !stale(["accounts"])).toBe(true);
  });
});

describe("affects: finance and the profile", () => {
  it("a finance change refreshes the profile's income received this month", () => {
    expect(affects(["finance"])(["profile"])).toBe(true);
  });
});
