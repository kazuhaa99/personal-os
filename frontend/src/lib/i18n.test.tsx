import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { fmtDate, relativeDay } from "./format";
import { LangProvider, t, tp, useLang } from "./i18n";

function Switcher() {
  const { setLang } = useLang();
  return (
    <>
      <p>{t("Today")}</p>
      <button onClick={() => setLang("ru")}>ru</button>
      <button onClick={() => setLang("ko")}>ko</button>
      <button onClick={() => setLang("en")}>en</button>
    </>
  );
}

describe("i18n", () => {
  it("switches language, plurals and date order", () => {
    render(<QueryClientProvider client={new QueryClient()}><LangProvider><Switcher /></LangProvider></QueryClientProvider>);
    expect(screen.getByText("Today")).toBeTruthy();
    expect(tp("{n} days ago", 1)).toBe("1 day ago");

    act(() => screen.getByText("ru").click());
    expect(screen.getByText("Сегодня")).toBeTruthy();
    expect(tp("{n} days ago", 1)).toBe("1 день назад");
    expect(tp("{n} days ago", 3)).toBe("3 дня назад");
    expect(tp("{n} days ago", 11)).toBe("11 дней назад");
    expect(relativeDay("2026-10-18", "2026-10-19")).toBe("Вчера");
    expect(t("Some untranslated text")).toBe("Some untranslated text");

    act(() => screen.getByText("ko").click());
    expect(fmtDate("2026-10-19")).toBe("2026년 10월 19일");
    act(() => screen.getByText("en").click());
    expect(fmtDate("2026-10-19")).toBe("19 Oct 2026");
  });
});
