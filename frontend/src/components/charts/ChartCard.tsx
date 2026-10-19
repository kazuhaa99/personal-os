import { Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TooltipProps } from "recharts";
import { Button, Card, cn } from "@/components/ui/primitives";

// Chart chrome — validated dark categorical steps (see dataviz palette).
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"] as const;
export const GRID = "var(--chart-grid)";
export const AXIS = "var(--chart-axis)";
export const NEG = "#e66767"; // diverging negative pole (red), positive pole is series-1 blue
export const axisProps = { stroke: AXIS, tick: { fill: AXIS, fontSize: 11 }, tickLine: false, axisLine: false } as const;

export interface TableSpec { columns: string[]; rows: (string | number)[][] }

/** Card with title, legend, optional table view (every value reachable without hover). */
export function ChartCard({ title, subtitle, legend, table, children, className, action, empty }: {
  title: string; subtitle?: ReactNode; legend?: { label: string; color: string; kind?: "bar" | "line" | "dash" }[];
  table?: TableSpec; children: ReactNode; className?: string; action?: ReactNode; empty?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {action}
          {table && !empty && (
            <Button variant="ghost" size="sm" aria-pressed={showTable} onClick={() => setShowTable((s) => !s)}>
              <Table2 className="h-3.5 w-3.5" /> {showTable ? "Chart" : "Table"}
            </Button>
          )}
        </div>
      </div>
      {legend && legend.length > 1 && !showTable && !empty && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-2 text-xs text-ink-2">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              {l.kind === "line" || l.kind === "dash"
                ? <span className="inline-block w-3 h-0.5 rounded" style={{ background: l.kind === "dash" ? `repeating-linear-gradient(90deg, ${l.color} 0 3px, transparent 3px 5px)` : l.color }} />
                : <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: l.color }} />}
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div className="px-3 pb-4 pt-3 flex-1">
        {empty ?? (showTable && table ? (
          <div className="overflow-auto max-h-72 px-2">
            <table className="w-full text-xs tnum">
              <thead><tr className="text-ink-3">{table.columns.map((c, i) => <th key={c} className={cn("py-1.5 font-normal", i === 0 ? "text-left" : "text-right")}>{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, ri) => (
                <tr key={ri} className="border-t hairline">{r.map((v, i) => <td key={i} className={cn("py-1.5", i === 0 ? "text-left text-ink-2" : "text-right")}>{v}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        ) : children)}
      </div>
    </Card>
  );
}

/** Tooltip: value leads (strong), series name follows; line keys, not boxes. */
export function ChartTooltip({ active, payload, label, format, labelFormat }: TooltipProps<number, string> & { format: (v: number, name: string) => string; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border hairline bg-raised/95 px-3 py-2 shadow-xl text-xs">
      <p className="text-ink-3 mb-1">{labelFormat ? labelFormat(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: (p.payload?.fill as string | undefined) ?? p.color }} />
          <span className="font-semibold text-ink tnum">{format(Number(p.value), String(p.name))}</span>
          <span className="text-ink-3">{p.name}</span>
        </p>
      ))}
    </div>
  );
}
