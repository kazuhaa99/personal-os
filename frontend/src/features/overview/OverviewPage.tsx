import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowRight, CalendarClock, Check, CheckSquare, Flame, Plus, Target, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatMoney, relativeDay, ACCOUNT_TYPE_LABEL } from "@/lib/format";
import { useAction } from "@/lib/queries";
import type { Dashboard, Habit } from "@/lib/types";
import { Badge, Button, Card, CardHeader, cn, DemoBadge, EmptyState, ErrorBlock, LoadingBlock, MoneyText, Progress } from "@/components/ui/primitives";
import { useQuickActions } from "@/components/layout/QuickActions";
import { TaskRow } from "@/features/tasks/TaskRow";
import { InsightList } from "./InsightList";

function greeting(hour: number) {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function HabitChip({ habit, today }: { habit: Habit; today: string }) {
  const toggle = useAction(() => api.put(`/habits/${habit.id}/completions`, { date: today, done: !habit.done_today }));
  return (
    <button
      type="button"
      onClick={() => toggle.mutate(undefined)}
      disabled={toggle.isPending}
      aria-pressed={habit.done_today}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 h-9 text-sm transition-colors",
        habit.done_today ? "border-transparent bg-white/[0.08] text-ink" : "hairline text-ink-2 hover:bg-white/[0.04]",
      )}
    >
      <span className="h-4 w-4 rounded-full grid place-items-center" style={{ background: habit.done_today ? habit.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${habit.color}` }}>
        {habit.done_today && <Check className="h-2.5 w-2.5 text-black" strokeWidth={3} />}
      </span>
      <span className="truncate max-w-[12rem]">{habit.name.replace(/^Demo · /, "")}</span>
      {habit.current_streak > 1 && <span className="text-2xs text-ink-3 tnum">{habit.current_streak}d</span>}
    </button>
  );
}

export function OverviewPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard") });
  const qa = useQuickActions();
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const cur = data.primary_currency;
  const name = data.owner_name ? `, ${data.owner_name}` : "";
  const cash = data.accounts.totals;
  const budgetUtil = data.budget.utilization ? Number(data.budget.utilization) : null;
  const hasAccounts = data.accounts.items.length > 0;
  const scheduledHabits = data.habits.items.filter((h) => h.scheduled_today);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-3">{format(parseISO(data.today), "EEEE, d MMMM")}</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{greeting(new Date().getHours())}{name}</h1>
          <p className="text-sm text-ink-3 mt-1">
            {data.tasks.counts.today + data.tasks.counts.overdue > 0
              ? `${data.tasks.counts.today} task${data.tasks.counts.today === 1 ? "" : "s"} due today${data.tasks.counts.overdue ? `, ${data.tasks.counts.overdue} overdue` : ""}.`
              : "Nothing due today."}{" "}
            {data.habits.scheduled_today > 0 && `${data.habits.done_today}/${data.habits.scheduled_today} habits done.`}
          </p>
        </div>
      </div>

      {/* Money strip: one hero figure + the month in context */}
      <Card className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
        <Link to="/finances/accounts" className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
          <p className="text-xs text-ink-3 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Available in active accounts</p>
          {cash.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">No accounts yet — <span className="text-accent">add one</span></p>
          ) : (
            cash.map((t) => <p key={t.currency} className="mt-1.5 text-3xl font-semibold tracking-tight tnum">{formatMoney(t.amount, t.currency)}</p>)
          )}
          <p className="text-2xs text-ink-3 mt-1">Sum of account balances, by currency. Not net worth.</p>
        </Link>
        <Link to="/analytics" className="px-5 py-4 hover:bg-white/[0.02]">
          <p className="text-xs text-ink-3">{data.month.label} · income vs expenses</p>
          <p className="mt-2 text-sm flex justify-between"><span className="text-ink-2">Income</span><MoneyText value={data.month.income} currency={cur} /></p>
          <p className="mt-1 text-sm flex justify-between"><span className="text-ink-2">Expenses</span><MoneyText value={data.month.expense} currency={cur} /></p>
          <p className="mt-1 text-sm flex justify-between border-t hairline pt-1"><span className="text-ink-2">Net cash flow</span><MoneyText value={data.month.net_cash_flow} currency={cur} signed colored /></p>
        </Link>
        <Link to="/finances/budgets" className="px-5 py-4 hover:bg-white/[0.02]">
          <p className="text-xs text-ink-3">Budget used this month</p>
          {budgetUtil === null ? (
            <p className="mt-2 text-sm text-ink-2">No budgets set — <span className="text-accent">set limits</span></p>
          ) : (
            <>
              <p className="mt-1.5 text-xl font-semibold tnum">{data.budget.utilization}%</p>
              <Progress className="mt-2" value={budgetUtil} tone={budgetUtil > 100 ? "bad" : budgetUtil >= 85 ? "warn" : "accent"} label="Budget utilization" />
              <p className="text-2xs text-ink-3 mt-1.5 tnum">{formatMoney(data.budget.total_spent, cur)} of {formatMoney(data.budget.total_limit, cur)}</p>
            </>
          )}
        </Link>
        <Link to="/finances/recurring" className="px-5 py-4 hover:bg-white/[0.02]">
          <p className="text-xs text-ink-3">Expected outflows · next 30 days</p>
          <p className="mt-1.5 text-xl font-semibold tnum">{formatMoney(data.expected_payments.total_expected_outflow_30d, cur)}</p>
          <p className="text-2xs text-ink-3 mt-1">Projection from recurring rules & installments.</p>
          {data.liabilities.map((l) => (
            <p key={l.currency} className="text-2xs text-ink-2 mt-1.5">Outstanding installments: <span className="tnum">{formatMoney(l.amount, l.currency)}</span></p>
          ))}
        </Link>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Today" to="/tasks" subtitle={`${data.tasks.counts.done_today} completed today`}
              action={<Button size="sm" variant="ghost" onClick={() => qa.newTask()}><Plus className="h-3.5 w-3.5" /> Add</Button>} />
            <div className="px-2 pb-2">
              {data.tasks.today.length === 0 ? (
                <EmptyState className="py-6" icon={<CheckSquare className="h-5 w-5" />} title="A clear day" body="Nothing due today or overdue." />
              ) : (
                data.tasks.today.map((t) => <TaskRow key={t.id} task={t} today={data.today} compact />)
              )}
              {data.tasks.upcoming.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-2xs uppercase tracking-wider text-ink-3">Next 7 days</p>
                  {data.tasks.upcoming.map((t) => <TaskRow key={t.id} task={t} today={data.today} compact />)}
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Habits" to="/habits" subtitle={scheduledHabits.length ? `${data.habits.done_today} of ${data.habits.scheduled_today} done today` : undefined} />
            <div className="px-5 pb-4">
              {data.habits.items.length === 0 ? (
                <EmptyState className="py-4" icon={<Flame className="h-5 w-5" />} title="No habits yet" action={<Link to="/habits"><Button size="sm">Create a habit</Button></Link>} />
              ) : scheduledHabits.length === 0 ? (
                <p className="text-sm text-ink-3">No habits scheduled today.</p>
              ) : (
                <div className="flex flex-wrap gap-2">{scheduledHabits.map((h) => <HabitChip key={h.id} habit={h} today={data.today} />)}</div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Active goals" to="/goals" />
            <div className="px-5 pb-4">
              {data.goals.length === 0 ? (
                <EmptyState className="py-4" icon={<Target className="h-5 w-5" />} title="No active goals" action={<Link to="/goals"><Button size="sm">Set a goal</Button></Link>} />
              ) : (
                <ul className="space-y-3.5">
                  {data.goals.map((g) => (
                    <li key={g.id}>
                      <Link to={`/goals?goal=${g.id}`} className="block group">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm truncate group-hover:text-accent">{g.title}<DemoBadge show={g.is_demo} /></p>
                          <span className="text-xs tnum text-ink-2 shrink-0">
                            {g.progress}%{g.target_date && <span className={cn("ml-2", g.overdue ? "text-[#f07a7a]" : "text-ink-3")}>{g.overdue ? "overdue" : `${g.days_left}d left`}</span>}
                          </span>
                        </div>
                        <Progress className="mt-1.5" value={g.progress} tone={g.overdue ? "warn" : "accent"} label={`${g.title} progress`} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Attention" subtitle="Rule-based alerts. Each explains why it appeared." />
            <InsightList items={data.insights} />
          </Card>

          <Card>
            <CardHeader title="Upcoming payments" to="/finances/recurring" subtitle="Expected — not yet recorded" />
            {data.expected_payments.items.length === 0 ? (
              <EmptyState className="py-5" icon={<CalendarClock className="h-5 w-5" />} title="Nothing scheduled" body="Add recurring payments or installment plans to see what's coming." />
            ) : (
              <ul className="px-2 pb-2">
                {data.expected_payments.items.slice(0, 6).map((p) => (
                  <li key={`${p.kind}-${p.source_id}-${p.due_date}`}>
                    <Link to={p.kind === "installment" ? "/finances/installments" : "/finances/recurring"} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03]">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{p.name}</p>
                        <p className={cn("text-xs", p.overdue ? "text-[#f07a7a]" : "text-ink-3")}>{p.overdue ? "Overdue · " : ""}{relativeDay(p.due_date, data.today)} · {p.kind === "installment" ? "installment" : "recurring"}</p>
                      </div>
                      <MoneyText value={p.type === "expense" ? `-${p.amount}` : p.amount} currency={p.currency} className="text-sm" signed />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Accounts" to="/finances/accounts" />
            {!hasAccounts ? (
              <EmptyState className="py-5" title="No accounts" action={<Link to="/finances/accounts"><Button size="sm" variant="primary">Add account</Button></Link>} />
            ) : (
              <ul className="px-5 pb-4 space-y-2">
                {data.accounts.items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink-2">{a.name}<Badge className="ml-2">{ACCOUNT_TYPE_LABEL[a.type]}</Badge></span>
                    <MoneyText value={a.current_balance} currency={a.currency} className={cn(a.current_balance.startsWith("-") && "text-bad")} />
                  </li>
                ))}
                <li><Link to="/finances/transactions" className="mt-1 inline-flex items-center gap-1 text-xs text-accent">All transactions <ArrowRight className="h-3 w-3" /></Link></li>
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
