import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/format";
import { CURRENCY, TODAY, type Tx } from "../data";

export const fm = (v: string, opts?: { sign?: boolean }) => formatMoney(v, CURRENCY, opts);
export const txSigned = (t: Tx) => (t.type === "expense" ? `-${t.amount}` : t.amount);

export function dayLabel(d: string) {
  const diff = differenceInCalendarDays(parseISO(d), parseISO(TODAY));
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  return format(parseISO(d), "EEEE, d MMMM");
}

/** Splits "2 438 750 ₸" into integer and the rest so big numbers can be typeset. */
export function splitMoney(v: string) {
  const s = fm(v);
  const m = s.match(/^([−+]?[\d ]+)(.*)$/);
  return m ? { main: m[1], rest: m[2] } : { main: s, rest: "" };
}
