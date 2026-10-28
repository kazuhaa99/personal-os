import { afterEach, vi } from "vitest";
import { formatMoney, isNegative, normalizeAmount, nowInAppZone, setAppTimeZone, todayISO } from "./format";
import { qs } from "./api";

const T = " ";

describe("formatMoney", () => {
  it("groups thousands without float conversion", () => {
    expect(formatMoney("1234567.50", "KZT")).toBe(`1${T}234${T}567.50${T}₸`);
    expect(formatMoney("12345678901234.99", "USD")).toBe(`12${T}345${T}678${T}901${T}234.99${T}$`);
  });
  it("hides zero cents unless asked", () => {
    expect(formatMoney("1000.00", "KZT")).toBe(`1${T}000${T}₸`);
    expect(formatMoney("1000.00", "KZT", { decimals: "always" })).toBe(`1${T}000.00${T}₸`);
  });
  it("renders signs with a real minus and optional plus", () => {
    expect(formatMoney("-5.10", "KZT")).toBe(`−5.10${T}₸`);
    expect(formatMoney("5", "KZT", { sign: true })).toBe(`+5${T}₸`);
    expect(formatMoney("-0.00", "KZT")).toBe(`0${T}₸`);
  });
  it("falls back to the ISO code for unknown currencies", () => {
    expect(formatMoney("10", "GBP")).toBe("10 GBP");
  });
  it("shows a dash for missing values", () => {
    expect(formatMoney(null)).toBe("—");
  });
});

describe("normalizeAmount", () => {
  it.each([["1 234,5", "1234.5"], ["0.10", "0.10"], ["100", "100"], ["1 000", "1000"]])("%s -> %s", (input, out) => {
    expect(normalizeAmount(input)).toBe(out);
  });
  it.each(["", "abc", "1.234", "-5", "1e3", "1,2,3"])("rejects %s", (input) => {
    expect(normalizeAmount(input)).toBeNull();
  });
});

describe("helpers", () => {
  it("isNegative ignores negative zero", () => {
    expect(isNegative("-1.00")).toBe(true);
    expect(isNegative("-0.00")).toBe(false);
    expect(isNegative("3")).toBe(false);
  });
  it("qs drops empty params", () => {
    expect(qs({ a: 1, b: "", c: null, d: undefined, e: false })).toBe("?a=1&e=false");
    expect(qs({})).toBe("");
  });
});

describe("today in the timezone from Settings, not the browser's", () => {
  afterEach(() => { vi.useRealTimers(); setAppTimeZone(null); });

  it("follows the configured zone across the date line", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    setAppTimeZone("Pacific/Kiritimati"); // UTC+14: already the 28th
    expect(todayISO()).toBe("2026-10-28");
    expect(nowInAppZone().getHours()).toBe(2);
    setAppTimeZone("Pacific/Pago_Pago"); // UTC-11: still the 27th
    expect(todayISO()).toBe("2026-10-27");
  });

  it("ignores a zone the browser doesn't know", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 23, 30));
    setAppTimeZone("Not/AZone");
    expect(todayISO()).toBe("2026-10-27");
  });
});

describe("formatMoney whole amounts", () => {
  it("rounds to whole units, half away from zero, without floats", () => {
    expect(formatMoney("32466.67", "KZT", { decimals: "none" })).toBe(`32${T}467${T}₸`);
    expect(formatMoney("32466.49", "KZT", { decimals: "none" })).toBe(`32${T}466${T}₸`);
    expect(formatMoney("999.5", "KZT", { decimals: "none" })).toBe(`1${T}000${T}₸`);
    expect(formatMoney("-0.4", "KZT", { decimals: "none" })).toBe(`0${T}₸`);
    expect(formatMoney("-12.5", "USD", { decimals: "none" })).toBe(`−13${T}$`);
    expect(formatMoney("99999999999999.99", "KZT", { decimals: "none" })).toBe(`100${T}000${T}000${T}000${T}000${T}₸`);
  });
});
