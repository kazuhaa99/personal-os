import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { AXIS, ChartTooltip, SERIES } from "@/components/charts/ChartCard";
import { formatMoney, monthLabel } from "@/lib/format";
import { t } from "@/lib/i18n";

export interface FlowMonth { month: string; income: number; expense: number }

/** The overview's cash-flow bars. Its own module, loaded after the page, so the charting library
 * (the app's largest dependency) never delays the first screen. */
export default function CashFlowChart({ flow, currency }: { flow: FlowMonth[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={flow} barGap={2} barCategoryGap="30%">
        <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, "MMM")} stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "rgb(var(--fill) / 0.05)" }} content={<ChartTooltip format={(v) => formatMoney(v.toFixed(2), currency)} labelFormat={(l) => monthLabel(l, "MMMM yyyy")} />} />
        <Bar dataKey="income" name={t("Income")} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expense" name={t("Expenses")} fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
