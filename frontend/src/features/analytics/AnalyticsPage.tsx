import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfYear, subMonths } from "date-fns";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { api } from "@/lib/api";
import { compactMoney, fmtDate, formatMoney, monthLabel } from "@/lib/format";
import type { AnalyticsSummary, ExpectedPayment } from "@/lib/types";
import { AXIS, axisProps, ChartCard, ChartTooltip, GRID, NEG, SERIES } from "@/components/charts/ChartCard";
import { Card, CardHeader, EmptyState, ErrorBlock, Input, LoadingBlock, MetricCard, MoneyText, Segmented, Select, cn } from "@/components/ui/primitives";

const M = "yyyy-MM";
type Preset = "3m" | "6m" | "12m" | "ytd" | "custom";

function rangeFor(p: Preset): [string, string] {
  const now = new Date();
  if (p === "ytd") return [format(startOfYear(now), M), format(now, M)];
  const n = p === "3m" ? 3 : p === "12m" ? 12 : 6;
  return [format(subMonths(now, n - 1), M), format(now, M)];
}

const num = (s: string | null | undefined) => (s ? Number(s) : 0); // chart geometry only; displayed values use strings

export function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>("6m");
  const [custom, setCustom] = useState(rangeFor("6m"));
  const [start, end] = preset === "custom" ? custom : rangeFor(preset);
  const [trendKey, setTrendKey] = useState("total");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["analytics", start, end],
    queryFn: () => api.get<AnalyticsSummary>("/analytics/summary", { start, end }),
  });
  const { data: expected = [] } = useQuery({ queryKey: ["expected", 90], queryFn: () => api.get<ExpectedPayment[]>("/recurring/expected", { days: 90 }) });

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={preset} onChange={(p) => setPreset(p)} options={[
        { value: "3m", label: "3 months" }, { value: "6m", label: "6 months" }, { value: "12m", label: "12 months" }, { value: "ytd", label: "This year" }, { value: "custom", label: "Custom" },
      ]} />
      {preset === "custom" && (
        <>
          <Input type="month" aria-label="From month" className="w-[10rem]" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} />
          <span className="text-ink-3">–</span>
          <Input type="month" aria-label="To month" className="w-[10rem]" value={custom[1]} min={custom[0]} max={format(addMonths(new Date(), 0), M)} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} />
        </>
      )}
    </div>
  );

  if (isLoading) return <div className="space-y-5">{filters}<LoadingBlock /></div>;
  if (error || !data) return <div className="space-y-5">{filters}<ErrorBlock error={error} onRetry={() => refetch()} /></div>;

  const cur = data.currency;
  const fm = (v: number) => formatMoney(v.toFixed(2), cur);
  const cf = data.cash_flow;
  const noData = cf.months_with_data === 0;
  const emptyChart = <EmptyState className="py-10" icon={<BarChart3 className="h-5 w-5" />} title="No transactions in this period" body={<>Record income and expenses, or <Link className="text-accent" to="/finances/transactions">import a CSV</Link>.</>} />;

  const flowRows = cf.months.map((m) => ({ month: m.month, income: num(m.income), expense: num(m.expense), net: num(m.net_cash_flow) }));
  const trendSeries = data.trend.series;
  const trendRows = data.trend.months.map((m) => {
    const total = cf.months.find((x) => x.month === m.month)?.expense;
    return { month: m.month as string, value: trendKey === "total" ? num(total) : num(m[trendKey]) };
  });
  const trendName = trendKey === "total" ? "All expenses" : trendSeries.find((s) => s.key === trendKey)?.name ?? "";
  const balRows = data.balances.points.map((p) => ({ month: p.month, total: num(p.total_balance), savings: num(p.savings_balance) }));
  const hasSavings = data.balances.points.some((p) => num(p.savings_balance) !== 0);
  const budgetRows = data.budget_performance.months.filter((m) => m.limit !== null).map((m) => ({ month: m.month, spent: num(m.spent), limit: num(m.limit), over: m.over_count }));
  const installments = expected.filter((e) => e.kind === "installment");
  const latestBalance = data.balances.points.at(-1);
  const savingsRateAvg = num(cf.total_income) > 0 ? ((num(cf.total_income) - num(cf.total_expense)) / num(cf.total_income)) * 100 : null;

  const xTick = (m: string) => monthLabel(m, "MMM");

  return (
    <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-70")}>
      {filters}

      {/* Headline numbers — each concept labelled separately */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="Income (actual)" value={formatMoney(cf.total_income, cur)} sub={`${monthLabel(start)} – ${monthLabel(end)}`} />
        <MetricCard label="Expenses (actual)" value={formatMoney(cf.total_expense, cur)} sub={cf.average_monthly_expense ? `avg ${formatMoney(cf.average_monthly_expense, cur)} / month with data` : "no data"} />
        <MetricCard label="Net cash flow" value={formatMoney(cf.net_cash_flow, cur, { sign: true })} tone={cf.net_cash_flow.startsWith("-") ? "bad" : "good"} sub={savingsRateAvg !== null ? `${savingsRateAvg.toFixed(1)}% of income kept` : "income − expenses; transfers excluded"} />
        <MetricCard label="Balance in accounts" value={latestBalance ? formatMoney(latestBalance.total_balance, cur) : "—"} sub={latestBalance ? `as of ${fmtDate(latestBalance.as_of)} · incl. savings ${formatMoney(latestBalance.savings_balance, cur)}` : undefined} to="/finances/accounts" />
        <MetricCard label="Outstanding liabilities" value={data.liabilities.length ? data.liabilities.map((l) => formatMoney(l.amount, l.currency)).join(" · ") : formatMoney("0", cur)} sub="Tracked installment plans" to="/finances/installments" />
      </div>
      <p className="text-2xs text-ink-3 -mt-2 px-1">Account balance is not net worth: other assets and untracked debts aren't included. Figures cover {cur} accounts only.</p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard title="Income vs expenses" subtitle="Monthly, actual transactions. Transfers excluded."
          legend={[{ label: "Income", color: SERIES[0] }, { label: "Expenses", color: SERIES[1] }]}
          table={{ columns: ["Month", "Income", "Expenses", "Net"], rows: cf.months.map((m) => [monthLabel(m.month), formatMoney(m.income, cur), formatMoney(m.expense, cur), formatMoney(m.net_cash_flow, cur, { sign: true })]) }}
          empty={noData ? emptyChart : undefined}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={flowRows} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={xTick} {...axisProps} />
              <YAxis tickFormatter={compactMoney} width={44} {...axisProps} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip format={(v) => fm(v)} labelFormat={(l) => monthLabel(l, "MMMM yyyy")} />} />
              <Bar isAnimationActive={false} dataKey="income" name="Income" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar isAnimationActive={false} dataKey="expense" name="Expenses" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Net cash flow" subtitle={<>Income − expenses per month. <span style={{ color: SERIES[0] }}>Blue</span> = kept, <span style={{ color: NEG }}>red</span> = overspent.</>}
          table={{ columns: ["Month", "Net cash flow", "Share of income kept"], rows: cf.months.map((m) => [monthLabel(m.month), formatMoney(m.net_cash_flow, cur, { sign: true }), m.savings_rate ? `${m.savings_rate}%` : "—"]) }}
          empty={noData ? emptyChart : undefined}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={flowRows} barCategoryGap="35%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={xTick} {...axisProps} />
              <YAxis tickFormatter={compactMoney} width={44} {...axisProps} />
              <ReferenceLine y={0} stroke={AXIS} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip format={(v) => formatMoney(v.toFixed(2), cur, { sign: true })} labelFormat={(l) => monthLabel(l, "MMMM yyyy")} />} />
              <Bar isAnimationActive={false} dataKey="net" name="Net cash flow" radius={[4, 4, 4, 4]} maxBarSize={32}>
                {flowRows.map((r) => <Cell key={r.month} fill={r.net < 0 ? NEG : SERIES[0]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Spending by category" subtitle={`${monthLabel(start)} – ${monthLabel(end)} · ${formatMoney(data.categories.total, cur)} total`}
          table={{ columns: ["Category", "Amount", "Share", "Transactions"], rows: data.categories.categories.map((c) => [c.name, formatMoney(c.amount, cur), `${c.share ?? "—"}%`, c.count]) }}
          empty={data.categories.categories.length === 0 ? emptyChart : undefined}>
          <ul className="px-2 space-y-2.5 max-h-[240px] overflow-y-auto">
            {data.categories.categories.map((c) => (
              <li key={c.category_id} className="group">
                <Link to={`/finances/transactions?type=expense&category_id=${c.category_id}&start=${start}-01`} className="block" title={`${c.name}: ${formatMoney(c.amount, cur)} (${c.share}%)`}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-ink-2 group-hover:text-ink truncate">{c.name}</span>
                    <span className="tnum text-ink">{formatMoney(c.amount, cur)} <span className="text-ink-3 ml-1 w-10 inline-block text-right">{c.share}%</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded-[3px] bg-fill/[0.04]">
                    <div className="h-full rounded-[3px] group-hover:brightness-125" style={{ width: `${Math.max(1, num(c.share))}%`, background: SERIES[0] }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Monthly expense trend" subtitle="Pick a category to see its trend on its own."
          action={
            <Select aria-label="Trend category" className="h-7 text-xs w-auto max-w-[11rem]" value={trendKey} onChange={(e) => setTrendKey(e.target.value)}>
              <option value="total">All expenses</option>
              {trendSeries.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </Select>
          }
          table={{ columns: ["Month", trendName], rows: trendRows.map((r) => [monthLabel(r.month), fm(r.value)]) }}
          empty={noData ? emptyChart : undefined}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendRows}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={xTick} {...axisProps} />
              <YAxis tickFormatter={compactMoney} width={44} {...axisProps} />
              <Tooltip cursor={{ stroke: AXIS, strokeWidth: 1 }} content={<ChartTooltip format={(v) => fm(v)} labelFormat={(l) => monthLabel(l, "MMMM yyyy")} />} />
              <Line isAnimationActive={false} type="monotone" dataKey="value" name={trendName} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))", fill: SERIES[0] }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Account balances" subtitle="End-of-month balance of tracked accounts (today for the current month)."
          legend={hasSavings ? [{ label: "All accounts", color: SERIES[0], kind: "line" }, { label: "Savings accounts", color: SERIES[2], kind: "line" }] : undefined}
          table={{ columns: ["Month", "All accounts", "Savings accounts"], rows: data.balances.points.map((p) => [monthLabel(p.month), formatMoney(p.total_balance, cur), formatMoney(p.savings_balance, cur)]) }}
          empty={balRows.length === 0 ? emptyChart : undefined}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={balRows}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={xTick} {...axisProps} />
              <YAxis tickFormatter={compactMoney} width={44} {...axisProps} />
              <Tooltip cursor={{ stroke: AXIS, strokeWidth: 1 }} content={<ChartTooltip format={(v) => fm(v)} labelFormat={(l) => monthLabel(l, "MMMM yyyy")} />} />
              <Line isAnimationActive={false} type="monotone" dataKey="total" name="All accounts" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              {hasSavings && <Line isAnimationActive={false} type="monotone" dataKey="savings" name="Savings accounts" stroke={SERIES[2]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Budget performance" subtitle="Spending in budgeted categories vs the sum of their limits."
          legend={[{ label: "Spent", color: SERIES[0] }, { label: "Limit", color: AXIS, kind: "dash" }]}
          table={{ columns: ["Month", "Spent", "Limit", "Categories over"], rows: budgetRows.map((r) => [monthLabel(r.month), fm(r.spent), fm(r.limit), r.over]) }}
          empty={budgetRows.length === 0 ? <EmptyState className="py-10" title="No budgets in this period" action={<Link to="/finances/budgets" className="text-xs text-accent">Set budgets</Link>} /> : undefined}>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={budgetRows} barCategoryGap="35%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={xTick} {...axisProps} />
              <YAxis tickFormatter={compactMoney} width={44} {...axisProps} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip format={(v) => fm(v)} labelFormat={(l) => monthLabel(l, "MMMM yyyy")} />} />
              <Bar isAnimationActive={false} dataKey="spent" name="Spent" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {budgetRows.map((r) => <Cell key={r.month} fill={r.spent > r.limit ? NEG : SERIES[0]} />)}
              </Bar>
              <Line isAnimationActive={false} type="step" dataKey="limit" name="Limit" stroke={AXIS} strokeDasharray="4 3" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <CardHeader title="Upcoming installment obligations" subtitle="Next 90 days — projected from your plans, not yet paid." to="/finances/installments" />
        {installments.length === 0 ? <p className="px-5 pb-4 text-xs text-ink-3">No scheduled installment payments.</p> : (
          <ul className="px-5 pb-4 divide-y divide-line/[0.08]">
            {installments.map((p) => (
              <li key={`${p.source_id}-${p.due_date}`} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-2">{fmtDate(p.due_date, "d MMM yyyy")} · {p.name}</span>
                <MoneyText value={p.amount} currency={p.currency} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.income_categories.categories.length > 0 && (
        <Card>
          <CardHeader title="Income sources" subtitle={`${formatMoney(data.income_categories.total, cur)} in the period`} />
          <ul className="px-5 pb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
            {data.income_categories.categories.map((c) => (
              <li key={c.category_id} className="flex justify-between text-sm"><span className="text-ink-2">{c.name}</span><span className="tnum">{formatMoney(c.amount, cur)} <span className="text-ink-3 text-xs">{c.share}%</span></span></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
