import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { format as isoFormat, parseISO, subDays } from "date-fns";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CheckSquare, Flame, Plus, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatMoney, relativeDay, nowInAppZone } from "@/lib/format";
import { goalArt } from "@/lib/goalArt";
import { format, t, tp } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { AnalyticsSummary, Dashboard, Habit } from "@/lib/types";
import { SERIES } from "@/components/charts/ChartCard";
import { Button, Card, CardHeader, cn, DemoBadge, EmptyState, ErrorBlock, GlassCard, LoadingBlock, MoneyText, Progress } from "@/components/ui/primitives";
import { useQuickActions } from "@/components/layout/QuickActions";
import { TaskRow } from "@/features/tasks/TaskRow";
import { InsightList } from "./InsightList";
import { LoadErrorBoundary } from "@/components/LoadErrorBoundary";
import { trimLeadingEmpty } from "@/lib/series";
import { isScheduled } from "@/lib/habitSchedule";

const CashFlowChart = lazy(() => import("./CashFlowChart"));

function greeting(hour: number) {
  if (hour < 5) return t("Good night");
  if (hour < 12) return t("Good morning");
  if (hour < 18) return t("Good afternoon");
  return t("Good evening");
}

const rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };

function Kpi({ label, value, sub, to, big, tone, children }: { label: string; value: string; sub?: string; to: string; big?: boolean; tone?: "good" | "bad"; children?: React.ReactNode }) {
  return (
    <Link to={to} className={cn("group relative z-[2] block px-5 py-4 transition-colors hover:bg-white/[0.08] border-line/[0.08] max-lg:border-b", big && "col-span-2 lg:col-span-1")}>
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className={cn("mt-1 font-semibold tracking-tight tnum", big ? "text-[30px] leading-9 lg:text-[32px]" : "text-[22px] leading-7", tone === "good" && "text-good", tone === "bad" && "text-bad")}>{value}</p>
      {children}
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </Link>
  );
}

function HabitMatrix({ habits, today }: { habits: Habit[]; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => isoFormat(subDays(parseISO(today), 6 - i), "yyyy-MM-dd"));
  const toggle = useAction(({ id, done }: { id: number; done: boolean }) => api.put(`/habits/${id}/completions`, { date: today, done }), { refresh: ["habits"] });
  return (
    <table className="w-full border-collapse text-[13.5px]">
      <thead>
        <tr>
          <th />
          {days.map((d) => <th key={d} className={cn("pb-1.5 text-xs font-semibold", d === today ? "text-accent" : "text-ink-3")}>{format(parseISO(d), "EEEEE")}</th>)}
          <th className="pb-1.5 pl-2 text-right text-xs font-semibold text-ink-3">{t("7 days")}</th>
        </tr>
      </thead>
      <tbody>
        {habits.map((h) => {
          const done = new Set(h.completions);
          return (
            <tr key={h.id}>
              <td className="pr-3 py-1 max-w-[10rem] truncate">{h.name.replace(/^Demo · /, "")}</td>
              {days.map((d) => {
                const on = done.has(d);
                const isToday = d === today;
                const due = isScheduled(h, d);
                const look = cn("block h-6 w-full min-w-6 rounded-[6px] coarse:h-10",
                  // missed (due, not done): grey; not due that day: an empty outline
                  !on && (due ? "bg-fill/[0.09]" : "border border-dashed border-line/20"));
                const day = format(parseISO(d), "EEEE");
                return (
                  <td key={d} className="p-[3px]">
                    {isToday ? (
                      // Only today can be checked off here; aria-pressed carries done / not done.
                      <button disabled={toggle.isPending} onClick={() => toggle.mutate({ id: h.id, done: !on })} aria-pressed={on}
                        aria-label={`${h.name} ${t("today")}${due ? "" : t(", not scheduled")}`}
                        className={cn(look, "tap-target ring-2 ring-accent cursor-pointer transition-[background-color,transform] active:scale-90")}
                        style={on ? { background: h.color } : undefined} />
                    ) : (
                      <span role="img" aria-label={`${h.name} ${day}: ${on ? t("done") : due ? t("missed") : t("not scheduled")}`} className={look} style={on ? { background: h.color } : undefined} />
                    )}
                  </td>
                );
              })}
              <td className="pl-2 text-right text-xs text-ink-3 tnum">{h.week_rate ? `${Math.round(Number(h.week_rate))}%` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OverviewPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard") });
  const { data: summary } = useQuery({ queryKey: ["analytics", "overview"], queryFn: () => api.get<AnalyticsSummary>("/analytics/summary"), staleTime: 30_000 });
  const qa = useQuickActions();
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const cur = data.primary_currency;
  const name = data.owner_name ? `, ${data.owner_name}` : "";
  const budgetUtil = data.budget.utilization ? Number(data.budget.utilization) : null;
  const scheduledHabits = data.habits.items.filter((h) => h.scheduled_today);
  const flow = trimLeadingEmpty(summary?.cash_flow.months.map((m) => ({ month: m.month, income: Number(m.income), expense: Number(m.expense) })) ?? [], ["income", "expense"]);
  const hasFlow = (summary?.cash_flow.months_with_data ?? 0) > 0;
  const cash = data.accounts.totals.find((t) => t.currency === cur) ?? data.accounts.totals[0];

  return (
    <motion.div className="space-y-5" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[28px] font-semibold tracking-tight leading-tight">{greeting(nowInAppZone().getHours())}{name}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {data.tasks.counts.today + data.tasks.counts.overdue > 0
              ? `${tp("{n} task due today", data.tasks.counts.today)}${data.tasks.counts.overdue ? `, ${tp("{n} overdue", data.tasks.counts.overdue)}` : ""}`
              : t("Nothing due today")}
            {data.habits.scheduled_today > 0 && ` · ${t("{done}/{total} habits", { done: data.habits.done_today, total: data.habits.scheduled_today })}`}
            {data.insights.length > 0 && ` · ${tp("{n} thing to look at", data.insights.length)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => qa.newTask()}><Plus className="h-4 w-4" /> {t("Task")}</Button>
          <Button variant="primary" onClick={() => qa.newTransaction()}><Plus className="h-4 w-4" /> {t("Transaction")}</Button>
        </div>
      </motion.div>

      {/* Hero: the one Liquid Glass surface on the page */}
      <motion.div variants={rise}>
        <GlassCard className="grid grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr] divide-x divide-line/[0.08]">
          <Kpi big label={t("Available in active accounts")} to="/finances/accounts"
            value={cash ? formatMoney(cash.amount, cash.currency) : "—"}
            sub={data.accounts.totals.length > 1 ? `+ ${data.accounts.totals.filter((x) => x !== cash).map((x) => formatMoney(x.amount, x.currency)).join(", ")} · ${t("not net worth")}` : t("Sum of balances · not net worth")} />
          <Kpi label={`${t("Income")} · ${format(parseISO(data.today), "LLL")}`} to="/analytics" value={formatMoney(data.month.income, cur)} />
          <Kpi label={t("Expenses")} to="/analytics" value={formatMoney(data.month.expense, cur)} />
          <Kpi label={t("Net cash flow")} to="/analytics" value={formatMoney(data.month.net_cash_flow, cur, { sign: true })} tone={data.month.net_cash_flow.startsWith("-") ? "bad" : "good"} sub={t("Transfers excluded")} />
          <Kpi label={t("Budget used")} to="/finances/budgets" value={budgetUtil === null ? t("No budgets") : `${data.budget.utilization}%`}
            sub={budgetUtil === null ? t("Set monthly limits") : t("{spent} of {limit}", { spent: formatMoney(data.budget.total_spent, cur), limit: formatMoney(data.budget.total_limit, cur) })}>
            {budgetUtil !== null && <Progress className="mt-2" value={budgetUtil} tone={budgetUtil > 100 ? "bad" : budgetUtil >= 85 ? "warn" : "accent"} label={t("Budget utilization")} />}
          </Kpi>
        </GlassCard>
      </motion.div>

      {/* items-start: each card is as tall as its content, no empty slabs beside a taller neighbour. */}
      <div className="grid items-start gap-4 xl:grid-cols-3 [grid-template-areas:'today'_'flow'_'att'_'up'_'habits'_'goals'] xl:[grid-template-areas:'today_flow_flow'_'today_att_up'_'habits_habits_goals']">
        <motion.div variants={rise} className="[grid-area:today] min-w-0">
          <Card className="h-full">
            <CardHeader title={t("Today")} to="/tasks" subtitle={t("{n} done today", { n: data.tasks.counts.done_today })}
              action={<Button size="sm" variant="ghost" onClick={() => qa.newTask()}><Plus className="h-3.5 w-3.5" /> {t("Add")}</Button>} />
            <div className="px-2 pb-2">
              {data.tasks.today.length === 0 ? (
                <EmptyState className="py-6" icon={<CheckSquare className="h-5 w-5" />} title={t("A clear day")} body={t("Nothing due today or overdue.")} />
              ) : data.tasks.today.map((t) => <TaskRow key={t.id} task={t} today={data.today} compact />)}
              {data.tasks.upcoming.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-ink-3">{t("Next 7 days")}</p>
                  {data.tasks.upcoming.map((t) => <TaskRow key={t.id} task={t} today={data.today} compact />)}
                </>
              )}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={rise} className="[grid-area:flow] min-w-0">
          <Card className="h-full">
            <CardHeader title={t("Cash flow")} to="/analytics" subtitle={t("Last 6 months · actual transactions")}
              action={hasFlow ? <span className="flex items-center gap-3 text-xs text-ink-3"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: SERIES[0] }} />{t("Income")}</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: SERIES[1] }} />{t("Expenses")}</span></span> : undefined} />
            <div className="px-3 pb-3 h-[180px]">
              {!hasFlow ? <EmptyState className="py-8" title={t("No cash flow yet")} body={t("Income and expenses appear here as you record them.")} /> : (
                <LoadErrorBoundary><Suspense fallback={null}><CashFlowChart flow={flow} currency={cur} /></Suspense></LoadErrorBoundary>
              )}
            </div>
            {hasFlow && <p className="px-5 pb-3 -mt-1 text-xs text-ink-3">{t("Average spending {amount} / month across months with data", { amount: summary?.cash_flow.average_monthly_expense ? formatMoney(summary.cash_flow.average_monthly_expense, cur) : "—" })}</p>}
          </Card>
        </motion.div>

        <motion.div variants={rise} className="[grid-area:att] min-w-0">
          <Card className="h-full">
            <CardHeader title={t("Attention")} subtitle={t("Rule-based · each explains why")} />
            <InsightList items={data.insights} limit={4} />
          </Card>
        </motion.div>

        <motion.div variants={rise} className="[grid-area:up] min-w-0">
          <Card className="h-full">
            <CardHeader title={t("Upcoming")} to="/finances/recurring" subtitle={t("Expected · {amount} in 30 days", { amount: formatMoney(data.expected_payments.total_expected_outflow_30d, cur) })} />
            {data.expected_payments.items.length === 0 ? (
              <EmptyState className="py-5" icon={<CalendarClock className="h-5 w-5" />} title={t("Nothing scheduled")} body={t("Add recurring payments or installment plans.")} />
            ) : (
              <table className="w-full text-[13.5px]">
                <tbody>
                  {data.expected_payments.items.slice(0, 6).map((p) => (
                    <tr key={`${p.kind}-${p.source_id}-${p.due_date}`} className="border-t hairline first:border-0">
                      <td className={cn("pl-5 py-2 w-[86px] font-medium whitespace-nowrap", p.overdue ? "text-bad" : "text-accent")}>{p.overdue ? t("Overdue") : relativeDay(p.due_date, data.today)}</td>
                      <td className="py-2 truncate max-w-[9rem]"><Link to={p.kind === "installment" ? "/finances/installments" : "/finances/recurring"} className="hover:underline">{p.name.replace(/^Demo · /, "")}</Link></td>
                      <td className="pr-5 py-2 text-right whitespace-nowrap"><MoneyText value={p.type === "expense" ? `-${p.amount}` : p.amount} currency={p.currency} signed /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.liabilities.map((l) => (
              <p key={l.currency} className="mx-5 mt-2 mb-4 rounded-lg bg-fill/[0.04] px-3 py-2 text-xs text-ink-2">{t("Outstanding installments")} <b className="tnum float-right">{formatMoney(l.amount, l.currency)}</b></p>
            ))}
          </Card>
        </motion.div>

        <motion.div variants={rise} className="[grid-area:habits] min-w-0">
          <Card className="h-full">
            <CardHeader title={t("Habits")} to="/habits" subtitle={scheduledHabits.length ? t("{done} of {total} today · tap today's square to check in", { done: data.habits.done_today, total: data.habits.scheduled_today }) : t("Last 7 days")} />
            <div className="px-5 pb-4 overflow-x-auto">
              {data.habits.items.length === 0
                ? <EmptyState className="py-4" icon={<Flame className="h-5 w-5" />} title={t("No habits yet")} action={<Link to="/habits?new=1"><Button size="sm">{t("Create a habit")}</Button></Link>} />
                : <HabitMatrix habits={data.habits.items} today={data.today} />}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={rise} className="[grid-area:goals] min-w-0">
          <Card className="h-full">
            <CardHeader title={t("Goals")} to="/goals" />
            <div className="px-3 pb-3">
              {data.goals.length === 0 ? (
                <EmptyState className="py-4" icon={<Target className="h-5 w-5" />} title={t("No active goals")} action={<Link to="/goals?new=1"><Button size="sm">{t("Set a goal")}</Button></Link>} />
              ) : data.goals.map((g) => (
                <Link key={g.id} to={`/goals?goal=${g.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-fill/[0.04]">
                  <img src={goalArt(g.category)} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-[9px] object-cover bg-fill/[0.08]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{g.title}<DemoBadge show={g.is_demo} /></span>
                    <Progress className="mt-1.5" value={g.progress} tone={g.overdue ? "warn" : "accent"} label={t("{title} progress", { title: g.title })} />
                  </span>
                  <span className={cn("text-xs tnum", g.overdue ? "text-bad" : "text-ink-3")}>{g.progress}%</span>
                </Link>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      <motion.p variants={rise} className="flex items-center gap-4 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5 text-good" /> {t("actual figures come from recorded transactions")}</span>
        <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5 text-accent" /> {t("“expected” rows are projections")}</span>
      </motion.p>
    </motion.div>
  );
}
