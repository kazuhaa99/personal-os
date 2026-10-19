import { clsx, type ClassValue } from "clsx";
import { Loader2 } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { twMerge } from "tailwind-merge";
import { formatMoney, isNegative } from "@/lib/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ------------------------------------------------------------------ Button

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90 font-medium",
  secondary: "bg-white/[0.06] text-ink hover:bg-white/[0.1] border hairline",
  ghost: "text-ink-2 hover:text-ink hover:bg-white/[0.06]",
  danger: "bg-bad/90 text-white hover:bg-bad",
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
        "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "md" && "h-9 px-3.5",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "icon" && "h-8 w-8",
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
  "w-full rounded-lg bg-black/30 border hairline px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 disabled:opacity-60 aria-[invalid=true]:border-bad/70";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, "h-9 pr-8 select-chevron", className)} {...rest}>
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
    <label className={cn("inline-flex items-center gap-2 text-sm text-ink-2 cursor-pointer select-none", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-[rgb(var(--accent))]" />
      {label}
    </label>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cn("rounded-xl bg-surface border hairline", className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, to, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; to?: string; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        {to ? (
          <Link to={to} className="text-sm font-medium text-ink hover:text-accent transition-colors">{title}</Link>
        ) : (
          <h2 className="text-sm font-medium text-ink">{title}</h2>
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
  const cls = cn("block rounded-xl bg-surface border hairline px-4 py-3.5", to && "hover:bg-raised transition-colors", className);
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
    <div className={cn("h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" | "demo"; className?: string }) {
  const tones = {
    neutral: "bg-white/[0.06] text-ink-2",
    good: "bg-good/15 text-good",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-[#f07a7a]",
    accent: "bg-accent/15 text-accent",
    demo: "bg-[#a78bfa]/15 text-[#c4b5fd] border border-[#a78bfa]/30",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function DemoBadge({ show }: { show: boolean }) {
  return show ? <Badge tone="demo" className="ml-1.5 align-middle">demo</Badge> : null;
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
  return <Loader2 className={cn("h-5 w-5 animate-spin text-ink-3", className)} />;
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner />
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Failed to load";
  return (
    <EmptyState title="Couldn't load this" body={msg} action={onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>} />
  );
}

// ------------------------------------------------------------------ segmented control

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-lg bg-black/30 border hairline p-0.5 overflow-x-auto max-w-full", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 text-sm whitespace-nowrap transition-colors",
            size === "md" ? "h-8" : "h-7 text-xs px-2.5",
            value === o.value ? "bg-white/[0.1] text-ink" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="ml-1.5 text-2xs text-ink-3 tnum">{o.count}</span>}
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
