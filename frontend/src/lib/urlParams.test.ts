import { describe, expect, it } from "vitest";
import { dateParam, idParam, monthParam, offsetParam, oneOf } from "./urlParams";

describe("URL parameters edited by hand fall back instead of breaking the page", () => {
  it("monthParam keeps only real months", () => {
    expect(monthParam("2026-03", "2026-10")).toBe("2026-03");
    for (const bad of ["abc", "2026-13", "2026-00", "0000-01", "2026-3", null]) expect(monthParam(bad, "2026-10")).toBe("2026-10");
  });

  it("dateParam keeps only real dates", () => {
    expect(dateParam("2026-02-28")).toBe("2026-02-28");
    for (const bad of ["2026-02-30", "2026-13-01", "yesterday", null]) expect(dateParam(bad)).toBe("");
  });

  it("offsetParam is a non-negative whole number", () => {
    expect(offsetParam("50")).toBe(50);
    for (const bad of ["abc", "-10", "1.5", "", null]) expect(offsetParam(bad)).toBe(0);
  });

  it("idParam is a positive whole number or empty", () => {
    expect(idParam("12")).toBe("12");
    for (const bad of ["0", "x", "-3", null]) expect(idParam(bad)).toBe("");
  });

  it("oneOf keeps only listed values", () => {
    const views = ["today", "upcoming", "all"] as const;
    expect(oneOf("all", views, "today")).toBe("all");
    expect(oneOf("bogus", views, "today")).toBe("today");
    expect(oneOf(null, views, "today")).toBe("today");
  });
});
