import { motion } from "framer-motion";
import { useId, useMemo, useState, type CSSProperties } from "react";
import { formatMoney } from "@/lib/format";
import { CASHFLOW, CURRENCY, SPENDING } from "../data";
import { ease } from "./motion";

export interface ChartTheme {
  income: string;
  expense: string;
  grid: string;
  axis: string;
  font?: string;
  tooltipClass?: string;
}

function smoothPath(points: [number, number][]) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Income vs expenses over six months. Area (lines) or grouped bars; crosshair tooltip on hover/focus. */
export function FlowChart({ theme, height = 220, variant = "area", className, style }: {
  theme: ChartTheme; height?: number; variant?: "area" | "bars"; className?: string; style?: CSSProperties;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 12, t: 14, b: 26 };
  const max = 800;
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (CASHFLOW.length - 1);
  const xb = (i: number) => pad.l + ((i + 0.5) * (W - pad.l - pad.r)) / CASHFLOW.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const inc = useMemo(() => CASHFLOW.map((d, i) => [x(i), y(d.income)] as [number, number]), [H]); // eslint-disable-line react-hooks/exhaustive-deps
  const exp = useMemo(() => CASHFLOW.map((d, i) => [x(i), y(d.expense)] as [number, number]), [H]); // eslint-disable-line react-hooks/exhaustive-deps
  const hx = hover === null ? 0 : variant === "bars" ? xb(hover) : x(hover);

  return (
    <div className={className} style={{ position: "relative", fontFamily: theme.font, ...style }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Income and expenses, May to October (demo data)"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const step = (W - pad.l - pad.r) / (variant === "bars" ? CASHFLOW.length : CASHFLOW.length - 1);
          const i = variant === "bars" ? Math.floor((px - pad.l) / step) : Math.round((px - pad.l) / step);
          setHover(Math.max(0, Math.min(CASHFLOW.length - 1, i)));
        }}>
        <defs>
          <linearGradient id={`gi${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.income} stopOpacity="0.35" />
            <stop offset="100%" stopColor={theme.income} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`ge${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.expense} stopOpacity="0.28" />
            <stop offset="100%" stopColor={theme.expense} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 200, 400, 600, 800].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={theme.grid} strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill={theme.axis}>{v === 0 ? "0" : `${v}k`}</text>
          </g>
        ))}
        {CASHFLOW.map((d, i) => (
          <text key={d.month} x={variant === "bars" ? xb(i) : x(i)} y={H - 6} textAnchor="middle" fontSize={12} fill={hover === i ? theme.income : theme.axis}>{d.month}</text>
        ))}

        {variant === "area" ? (
          <>
            <motion.path d={`${smoothPath(inc)} L${x(5)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#gi${gid})`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }} />
            <motion.path d={`${smoothPath(exp)} L${x(5)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#ge${gid})`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.7 }} />
            <motion.path d={smoothPath(inc)} fill="none" stroke={theme.income} strokeWidth={2.25} strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease }} />
            <motion.path d={smoothPath(exp)} fill="none" stroke={theme.expense} strokeWidth={2.25} strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: 0.15, ease }} />
            {hover !== null && (
              <>
                <line x1={hx} x2={hx} y1={pad.t} y2={H - pad.b} stroke={theme.axis} strokeOpacity={0.5} />
                <circle cx={hx} cy={inc[hover][1]} r={4.5} fill={theme.income} stroke="white" strokeWidth={1.5} />
                <circle cx={hx} cy={exp[hover][1]} r={4.5} fill={theme.expense} stroke="white" strokeWidth={1.5} />
              </>
            )}
          </>
        ) : (
          CASHFLOW.map((d, i) => {
            const bw = 14;
            return (
              <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity .2s" }}>
                {[{ v: d.income, c: theme.income, o: -bw - 1 }, { v: d.expense, c: theme.expense, o: 1 }].map((b, j) => (
                  <motion.rect key={j} x={xb(i) + b.o} width={bw} rx={3} fill={b.c}
                    initial={{ y: y(0), height: 0 }} animate={{ y: y(b.v), height: y(0) - y(b.v) }}
                    transition={{ duration: 0.8, delay: 0.1 + i * 0.06 + j * 0.04, ease }} />
                ))}
              </g>
            );
          })
        )}
      </svg>
      {hover !== null && (
        <div className={theme.tooltipClass} role="status"
          style={{ position: "absolute", top: 8, left: `${(hx / W) * 100}%`, transform: `translateX(${hover > 3 ? "calc(-100% - 12px)" : "12px"})`, pointerEvents: "none", whiteSpace: "nowrap" }}>
          <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>{CASHFLOW[hover].month} 2026</div>
          <Row color={theme.income} value={formatMoney(CASHFLOW[hover].incomeS, CURRENCY)} label="income" />
          <Row color={theme.expense} value={formatMoney(CASHFLOW[hover].expenseS, CURRENCY)} label="expenses" />
        </div>
      )}
    </div>
  );
}

function Row({ color, value, label }: { color: string; value: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, lineHeight: "18px" }}>
      <span style={{ width: 12, height: 2, borderRadius: 2, background: color }} />
      <b style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{value}</b>
      <span style={{ opacity: 0.65 }}>{label}</span>
    </div>
  );
}

/** Spending donut with hover-to-inspect segments. */
export function Donut({ size = 180, thickness = 18, track, text, sub, className, gap = 2 }: {
  size?: number; thickness?: number; track: string; text: string; sub: string; className?: string; gap?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const total = SPENDING.reduce((s, d) => s + d.value, 0);
  const a = active !== null ? SPENDING[active] : null;
  return (
    <div className={className} style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Spending by category (demo data)">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {SPENDING.map((d, i) => {
          const len = (d.value / total) * c;
          const off = acc;
          acc += len;
          return (
            <motion.circle key={d.name} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color}
              strokeWidth={active === i ? thickness + 5 : thickness} strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-off}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              initial={{ opacity: 0, strokeDasharray: `0 ${c}` }}
              animate={{ opacity: active === null || active === i ? 1 : 0.35, strokeDasharray: `${Math.max(0, len - gap)} ${c}` }}
              transition={{ duration: 0.9, delay: 0.2 + i * 0.07, ease }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              style={{ cursor: "pointer", transition: "stroke-width .2s" }} />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
        <div>
          <div style={{ fontSize: size / 9, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: text }}>{a ? formatMoney(a.amount, CURRENCY) : sub}</div>
          <div style={{ fontSize: 12, opacity: 0.7, color: text, marginTop: 2 }}>{a ? `${a.name} · ${a.pct}%` : "spent this month"}</div>
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ values, color, width = 120, height = 36, fill = true }: { values: number[]; color: string; width?: number; height?: number; fill?: boolean }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)] as [number, number]);
  const d = smoothPath(pts);
  const gid = useId().replace(/:/g, "");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs><linearGradient id={`s${gid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".3" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#s${gid})`} />}
      <motion.path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease }} />
    </svg>
  );
}

export function Ring({ value, size = 56, stroke = 5, color, track, children }: { value: number; size?: number; stroke?: number; color: string; track: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1.2, ease, delay: 0.2 }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}
