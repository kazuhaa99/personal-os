import { describe, expect, it } from "vitest";
import { trimLeadingEmpty } from "./series";

describe("trimLeadingEmpty: a chart starts where the data starts", () => {
  const months = [
    { month: "2026-05", income: 0, expense: 0 },
    { month: "2026-06", income: 0, expense: 30 },
    { month: "2026-07", income: 0, expense: 0 },
    { month: "2026-08", income: 10, expense: 5 },
  ];

  it("drops empty months before the first one with data, keeps empty ones after it", () => {
    expect(trimLeadingEmpty(months, ["income", "expense"]).map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("returns nothing when no month has data", () => {
    expect(trimLeadingEmpty(months.map((m) => ({ ...m, income: 0, expense: 0 })), ["income", "expense"])).toEqual([]);
  });

  it("treats null as no data", () => {
    expect(trimLeadingEmpty([{ m: 1, v: null }, { m: 2, v: 3 }], ["v"]).map((x) => x.m)).toEqual([2]);
  });
});
