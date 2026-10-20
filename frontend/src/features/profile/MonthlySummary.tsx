import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { MonthlyIncome } from "@/lib/types";
import { Card, CardHeader, cn, EmptyState } from "@/components/ui/primitives";
import { num } from "./shared";

function Entry({ m }: { m: MonthlyIncome }) {
  const expected = num(m.expected);
  const received = num(m.received_this_month);
  const salaryShare = expected > 0 ? (num(m.salary) / expected) * 100 : 0;
  const extraShare = expected > 0 ? (num(m.extra) / expected) * 100 : 0;
  const pct = expected > 0 ? (received / expected) * 100 : received > 0 ? 100 : 0;
  const over = expected > 0 && received > expected;

  return (
    <div className="px-5 py-4 border-t hairline first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-ink-3">{t("Expected per month")}</p>
        <span className="text-2xs font-medium text-ink-3">{m.currency}</span>
      </div>
      <p className="mt-1 text-[28px] leading-tight font-semibold tracking-tight tnum text-ink break-words">{formatMoney(m.expected, m.currency)}</p>

      {expected > 0 && (
        <div className="mt-3">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-fill/[0.08]" aria-hidden>
            <motion.div className="h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${salaryShare}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
            <motion.div className="h-full bg-[rgb(175_82_222)]" initial={{ width: 0 }} animate={{ width: `${extraShare}%` }} transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-ink-3"><span className="h-2 w-2 rounded-full bg-accent shrink-0" />{t("Salary")}</dt>
              <dd className="mt-0.5 text-ink-2 tnum truncate">{formatMoney(m.salary, m.currency)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-ink-3"><span className="h-2 w-2 rounded-full bg-[rgb(175_82_222)] shrink-0" />{t("Additional")}</dt>
              <dd className="mt-0.5 text-ink-2 tnum truncate">{formatMoney(m.extra, m.currency)}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-fill/[0.04] px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-ink-3">{t("Received this month")}</span>
          <span className={cn("font-medium tnum", over ? "text-good" : "text-ink-2")}>{Math.round(pct)}%</span>
        </div>
        <p className="mt-1 text-sm tnum">
          <span className="font-semibold text-ink">{formatMoney(m.received_this_month, m.currency)}</span>
          {expected > 0 && <span className="text-ink-3"> / {formatMoney(m.expected, m.currency)}</span>}
        </p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-fill/[0.08] overflow-hidden" role="progressbar" aria-valuenow={Math.round(Math.min(pct, 100))} aria-valuemin={0} aria-valuemax={100} aria-label={t("Received this month")}>
          <motion.div className={cn("h-full rounded-full", over || pct >= 100 ? "bg-good" : "bg-accent")}
            initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
        </div>
        {over && (
          <p className="mt-1.5 text-xs text-good tnum">{t("{amount} above the plan", { amount: formatMoney(String((received - expected).toFixed(2)), m.currency) })}</p>
        )}
      </div>
    </div>
  );
}

export function MonthlySummary({ monthly }: { monthly: MonthlyIncome[] }) {
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4 text-ink-3" /> {t("Monthly income")}</span>} />
      {monthly.length ? (
        <>
          <div>{monthly.map((m) => <Entry key={m.currency} m={m} />)}</div>
          <p className="px-5 pb-4 pt-1 text-2xs leading-relaxed text-ink-3">
            {t("Expected = salary + active additional income, converted to a monthly amount. Received counts income transactions in accounts of the same currency.")}
          </p>
        </>
      ) : (
        <EmptyState className="py-8" icon={<TrendingUp className="h-6 w-6" />} title={t("No income set yet")}
          body={t("Add your salary or another income source to see how much you can expect each month.")} />
      )}
    </Card>
  );
}
