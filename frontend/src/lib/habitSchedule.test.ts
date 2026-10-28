import { describe, expect, it } from "vitest";
import { isScheduled } from "./habitSchedule";

describe("isScheduled: the same rule as the server (services/habits.py)", () => {
  const daily = { schedule: "daily" as const, weekdays: [], start_date: "2026-10-01" };
  const mwf = { schedule: "weekdays" as const, weekdays: [0, 2, 4], start_date: "2026-10-01" }; // 0 = Monday

  it("daily habits are due every day from their start", () => {
    expect(isScheduled(daily, "2026-10-01")).toBe(true);
    expect(isScheduled(daily, "2026-09-30")).toBe(false);
  });

  it("weekday habits are due only on their days", () => {
    expect(isScheduled(mwf, "2026-10-26")).toBe(true); // Monday
    expect(isScheduled(mwf, "2026-10-27")).toBe(false); // Tuesday
    expect(isScheduled(mwf, "2026-10-30")).toBe(true); // Friday
    expect(isScheduled(mwf, "2026-11-01")).toBe(false); // Sunday
  });
});
