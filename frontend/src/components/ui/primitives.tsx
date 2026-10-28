import { clsx, type ClassValue } from "clsx";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { twMerge } from "tailwind-merge";
import { formatMoney, isNegative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useSheen } from "@/lib/useSheen";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ------------------------------------------------------------------ Button

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.15)] hover:brightness-110 active:brightness-95",
  secondary: "bg-surface/80 text-ink border hairline shadow-[0_1px_2px_rgb(0_0_0/0.06)] hover:bg-surface active:bg-fill/[0.06]",
  ghost: "text-ink-2 hover:text-ink hover:bg-fill/[0.06] active:bg-fill/[0.1]",
  danger: "bg-bad text-bad-ink font-medium hover:brightness-110 active:brightness-95",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "icon";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm transition-[background-color,filter,transform] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "md" && "h-9 px-3.5 coarse:h-11",
        size === "sm" && "h-7 px-2.5 text-xs coarse:h-11 coarse:px-3",
        size === "icon" && "h-8 w-8 coarse:h-11 coarse:w-11",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ form controls

const control =
  "field w-full rounded-lg px-3 text-sm text-ink placeholder:text-ink-3 transition-shadow disabled:opacity-60 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad/60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-9 coarse:h-11", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, "h-9 coarse:h-11 pr-8 select-chevron", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, "py-2 min-h-[72px]", className)} {...rest} />;
});

export function Field({ label, error, hint, children, className }: { label: string; error?: string | null; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">{label}</label>
      {children(id)}
      {error ? <p className="text-xs text-bad" role="alert">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-ink-2 cursor-pointer select-none coarse:min-h-11", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-[rgb(var(--accent))]" />
      {label}
    </label>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cn("mat-panel rounded-2xl", className)}>{children}</As>;
}

/** Hero surface: translucent Liquid Glass with a pointer-following specular light. Use sparingly. */
export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useSheen<HTMLElement>();
  return <section ref={ref} className={cn("mat-glass sheen rounded-2xl overflow-hidden", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action, to, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; to?: string; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        {to ? (
          <Link to={to} className="text-[15px] font-semibold text-ink hover:text-accent transition-colors coarse:inline-flex coarse:min-h-11 coarse:items-center">{title}</Link>
        ) : (
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        )}
        {subtitle && <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({ label, value, sub, tone, to, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "neutral"; to?: string; className?: string }) {
  const body = (
    <>
      <p className="text-xs text-ink-3">{label}</p>
      <p className={cn("mt-1.5 text-xl font-semibold tracking-tight", tone === "good" && "text-good", tone === "bad" && "text-bad")}>{value}</p>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </>
  );
  const cls = cn("block mat-panel rounded-2xl px-4 py-3.5", to && "hover:bg-surface transition-colors", className);
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function MoneyText({ value, currency, className, signed, colored }: { value: string | null | undefined; currency: string; className?: string; signed?: boolean; colored?: boolean }) {
  const neg = isNegative(value);
  return (
    <span className={cn("tnum", colored && (neg ? "text-bad" : "text-good"), className)}>
      {formatMoney(value, currency, { sign: signed })}
    </span>
  );
}

// ------------------------------------------------------------------ feedback

export function Progress({ value, tone = "accent", className, label }: { value: number; tone?: "accent" | "good" | "warn" | "bad"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = { accent: "bg-accent", good: "bg-good", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-fill/[0.08] overflow-hidden", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" | "demo"; className?: string }) {
  const tones = {
    neutral: "bg-fill/[0.06] text-ink-2",
    good: "bg-good/12 text-good",
    warn: "bg-warn/12 text-warn",
    bad: "bg-bad/12 text-bad",
    accent: "bg-accent/12 text-accent",
    demo: "bg-demo/12 text-demo border border-demo/30",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function DemoBadge({ show }: { show: boolean }) {
  return show ? <Badge tone="demo" className="ml-1.5 align-middle">{t("demo")}</Badge> : null;
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-10", className)}>
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-ink-3", className)} aria-label={t("Loading")} />;
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner />
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : t("Failed to load");
  return (
    <EmptyState title={t("Couldn't load this")} body={msg} action={onRetry && <Button size="sm" onClick={onRetry}>{t("Retry")}</Button>} />
  );
}

// ------------------------------------------------------------------ segmented control

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: "sm" | "md" }) {
  const id = useId();
  return (
    <div role="tablist" className={cn("inline-flex rounded-[9px] bg-fill/[0.06] p-0.5 overflow-x-auto max-w-full", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative rounded-[7px] px-3 text-sm font-medium whitespace-nowrap transition-colors coarse:min-w-11",
            size === "md" ? "h-8 coarse:h-11" : "h-7 text-xs px-2.5 coarse:h-11",
            value === o.value ? "text-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[7px] bg-raised shadow-[0_0_0_0.5px_rgb(var(--line)/0.12),0_1px_3px_rgb(0_0_0/0.12)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">
            {o.label}
            {o.count !== undefined && o.count > 0 && <span className="ml-1.5 text-2xs text-ink-2 tnum">{o.count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-3 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
