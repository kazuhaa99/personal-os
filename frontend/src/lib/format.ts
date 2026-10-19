import { differenceInCalendarDays, format as isoFormat, parseISO } from "date-fns";
import { format, t, tp } from "./i18n";

const THIN = " ";
const SYMBOLS: Record<string, string> = { KZT: "₸", USD: "$", EUR: "€", RUB: "₽" };

/** Format a decimal string without going through float. "-1234567.5" -> "−1 234 567.50 ₸" */
export function formatMoney(value: string | null | undefined, currency = "KZT", opts: { sign?: boolean; decimals?: "auto" | "always" } = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  let s = String(value).trim();
  const negative = s.startsWith("-");
  if (negative || s.startsWith("+")) s = s.slice(1);
  const [intPartRaw, fracRaw = ""] = s.split(".");
  const intPart = (intPartRaw.replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  const frac = (fracRaw + "00").slice(0, 2);
  const showFrac = opts.decimals === "always" || frac !== "00";
  const isZero = /^0*$/.test(intPartRaw) && /^0*$/.test(fracRaw);
  const sign = negative && !isZero ? "−" : opts.sign && !isZero ? "+" : "";
  const sym = SYMBOLS[currency];
  const body = `${intPart}${showFrac ? "." + frac : ""}`;
  return sym ? `${sign}${body}${THIN}${sym}` : `${sign}${body} ${currency}`;
}

/** Compact for chart axes only (display, float is acceptable here). */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

export function isNegative(value: string | null | undefined): boolean {
  return !!value && value.trim().startsWith("-") && !/^-0*(\.0*)?$/.test(value.trim());
}

/** Normalise user input ("1 234,5") into an API decimal string, or null if invalid. */
export function normalizeAmount(input: string): string | null {
  const s = input.replace(/[\s  ']/g, "").replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  return s;
}

export function fmtDate(d: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!d) return "—";
  return format(parseISO(d), t(pattern)); // patterns are dictionary keys (Korean puts the year first)
}

export function relativeDay(d: string, today: string): string {
  const diff = differenceInCalendarDays(parseISO(d), parseISO(today));
  if (diff === 0) return t("Today");
  if (diff === 1) return t("Tomorrow");
  if (diff === -1) return t("Yesterday");
  if (diff < 0) return tp("{n} days ago", -diff);
  if (diff < 7) return format(parseISO(d), "EEEE");
  return format(parseISO(d), t("d MMM"));
}

export function monthLabel(m: string, pattern = "MMM yyyy"): string {
  return format(parseISO(`${m}-01`), t(pattern));
}

export function todayISO(): string {
  return isoFormat(new Date(), "yyyy-MM-dd");
}

const FREQUENCIES: Record<string, string> = {
  weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};
const ACCOUNT_TYPES: Record<string, string> = { cash: "Cash", bank: "Bank", savings: "Savings", other: "Other" };

/** Translated lookups (read at render time, so they follow the active language). */
const translated = (src: Record<string, string>) =>
  new Proxy(src, { get: (o, k: string) => (k in o ? t(o[k]) : undefined) }) as Record<string, string>;
export const FREQUENCY_LABEL = translated(FREQUENCIES);
export const ACCOUNT_TYPE_LABEL = translated(ACCOUNT_TYPES);
