import { format as dfFormat, type Locale } from "date-fns";
import { enGB, ko as koLocale, ru as ruLocale } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dict as en } from "./locales/en";
import { dict as ko } from "./locales/ko";
import { dict as ru } from "./locales/ru";

/**
 * Minimal i18n. Usage: t("Save"), tp("{n} task", count), format(date, "d MMM").
 * Dictionaries live in locales/<lang>/<area>.ts; English files hold only plural forms. Source strings are the English text (so missing translations
 * fall back to readable English). Plural entries hold CLDR forms selected with
 * Intl.PluralRules — Russian needs one/few/many, Korean only "other".
 */
export type Lang = "en" | "ru" | "ko";
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;
export type Dict = Record<string, string | PluralForms>;

export const LANGUAGES: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "ru", label: "Русский", short: "RU" },
  { id: "ko", label: "한국어", short: "한" },
];

const DICTS: Record<Lang, Dict> = { en, ru, ko };
const DATE_LOCALES: Record<Lang, Locale> = { en: enGB, ru: ruLocale, ko: koLocale };

function detect(): Lang {
  try {
    const saved = localStorage.getItem("pos.lang");
    if (saved === "en" || saved === "ru" || saved === "ko") return saved;
  } catch { /* ignore */ }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
  return nav.startsWith("ru") ? "ru" : nav.startsWith("ko") ? "ko" : "en";
}

let current: Lang = detect();
export const getLang = () => current;

function interpolate(s: string, vars?: Record<string, string | number>) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Translate an English source string. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = DICTS[current][key];
  const s = typeof entry === "string" ? entry : typeof entry === "object" ? entry.other ?? key : key;
  return interpolate(s, vars);
}

/** Translate with a plural form chosen for n ({n} is always available). */
export function tp(key: string, n: number, vars?: Record<string, string | number>): string {
  const entry = DICTS[current][key] ?? en[key];
  const form = new Intl.PluralRules(current).select(n);
  const s = typeof entry === "object" ? entry[form] ?? entry.other ?? key : typeof entry === "string" ? entry : key;
  return interpolate(s, { n, ...vars });
}

/** date-fns format with the active language's locale. */
export function format(date: Date | number, pattern: string): string {
  return dfFormat(date, pattern, { locale: DATE_LOCALES[current] });
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

/** Re-mounts the app subtree when the language changes so every string re-renders. */
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const qc = useQueryClient();
  const setLang = useCallback((l: Lang) => {
    current = l;
    try { localStorage.setItem("pos.lang", l); } catch { /* ignore */ }
    setLangState(l);
    // Server-written text (insights) is localised too: refetch it.
    qc.invalidateQueries();
  }, [qc]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}><Fragment key={lang}>{children}</Fragment></Ctx.Provider>;
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLang outside LangProvider");
  return ctx;
}
