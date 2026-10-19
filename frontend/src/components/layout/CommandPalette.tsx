import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight, BarChart3, CalendarClock, CheckSquare, CornerDownLeft, CreditCard, Flame, Landmark, LayoutDashboard, Moon, PiggyBank, Plus, Search,
  Settings, Sun, Target,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtDate, formatMoney } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Task, TxPage } from "@/lib/types";
import { cn } from "@/components/ui/primitives";
import { useQuickActions } from "./QuickActions";

interface Cmd { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }

function useDebounced<T>(value: T, ms = 180) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** ⌘K palette: navigate, create, switch appearance, and search real transactions and tasks. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const qa = useQuickActions();
  const theme = useTheme();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const term = useDebounced(q.trim());
  const searching = term.length >= 2;

  const txs = useQuery({ queryKey: ["palette-tx", term], enabled: open && searching, queryFn: () => api.get<TxPage>("/transactions", { q: term, limit: 6 }) });
  const tasks = useQuery({ queryKey: ["palette-tasks", term], enabled: open && searching, queryFn: () => api.get<Task[]>("/tasks", { q: term }) });

  useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => navigate(to);
    const i = (C: typeof Search) => <C className="h-4 w-4" />;
    const base: Cmd[] = [
      { id: "new-tx", group: "Create", label: "New transaction", hint: "T", icon: i(Plus), run: () => qa.newTransaction() },
      { id: "new-task", group: "Create", label: "New task", hint: "N", icon: i(Plus), run: () => qa.newTask() },
      { id: "new-goal", group: "Create", label: "New goal", icon: i(Target), run: go("/goals?new=1") },
      { id: "new-habit", group: "Create", label: "New habit", icon: i(Flame), run: go("/habits?new=1") },
      { id: "go-home", group: "Go to", label: "Overview", icon: i(LayoutDashboard), run: go("/") },
      { id: "go-tasks", group: "Go to", label: "Tasks", icon: i(CheckSquare), run: go("/tasks") },
      { id: "go-overdue", group: "Go to", label: "Overdue tasks", icon: i(CheckSquare), run: go("/tasks?view=overdue") },
      { id: "go-goals", group: "Go to", label: "Goals & Projects", icon: i(Target), run: go("/goals") },
      { id: "go-habits", group: "Go to", label: "Habits", icon: i(Flame), run: go("/habits") },
      { id: "go-tx", group: "Go to", label: "Transactions", icon: i(ArrowLeftRight), run: go("/finances/transactions") },
      { id: "go-acc", group: "Go to", label: "Accounts", icon: i(Landmark), run: go("/finances/accounts") },
      { id: "go-bud", group: "Go to", label: "Budgets", icon: i(PiggyBank), run: go("/finances/budgets") },
      { id: "go-rec", group: "Go to", label: "Recurring payments", icon: i(CalendarClock), run: go("/finances/recurring") },
      { id: "go-inst", group: "Go to", label: "Installments", icon: i(CreditCard), run: go("/finances/installments") },
      { id: "go-an", group: "Go to", label: "Analytics", icon: i(BarChart3), run: go("/analytics") },
      { id: "go-set", group: "Go to", label: "Settings", icon: i(Settings), run: go("/settings") },
      { id: "theme", group: "Appearance", label: theme.resolved === "dark" ? "Switch to light appearance" : "Switch to dark appearance", icon: theme.resolved === "dark" ? i(Sun) : i(Moon), run: theme.toggle },
    ];
    const s = q.trim().toLowerCase();
    const filtered = s ? base.filter((c) => c.label.toLowerCase().includes(s)) : base;
    const results: Cmd[] = [];
    if (searching) {
      for (const t of txs.data?.items ?? []) {
        results.push({
          id: `tx-${t.id}`, group: "Transactions", label: t.description || t.payee || t.category?.name || "Transfer",
          hint: `${fmtDate(t.date, "d MMM")} · ${formatMoney(t.type === "expense" ? `-${t.amount}` : t.amount, t.currency, { sign: t.type !== "transfer" })}`,
          icon: <ArrowLeftRight className="h-4 w-4" />, run: () => qa.editTransaction(t),
        });
      }
      for (const t of (tasks.data ?? []).slice(0, 5)) {
        results.push({ id: `task-${t.id}`, group: "Tasks", label: t.title, hint: t.due_date ? fmtDate(t.due_date, "d MMM") : t.status, icon: <CheckSquare className="h-4 w-4" />, run: () => qa.editTask(t) });
      }
    }
    return [...filtered, ...results];
  }, [q, searching, txs.data, tasks.data, navigate, qa, theme]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  function run(c: Cmd) {
    onOpenChange(false);
    // let the palette close before opening dialogs/navigating
    setTimeout(c.run, 0);
  }

  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/15" />
        <Dialog.Content className="dlg-content fixed z-50 left-1/2 top-[12vh] -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-[640px] rounded-2xl mat-popover overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(commands.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter" && commands[active]) { e.preventDefault(); run(commands[active]); }
          }}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search transactions and tasks, navigate, or run a command.</Dialog.Description>
          <div className="flex items-center gap-3 h-14 px-4 border-b hairline">
            <Search className="h-[18px] w-[18px] text-ink-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions, tasks, or type a command…"
              className="flex-1 bg-transparent text-[17px] outline-none focus-visible:outline-none placeholder:text-ink-3" aria-label="Command or search" />
            <kbd className="rounded bg-fill/[0.06] px-1.5 py-0.5 text-[11px] text-ink-3">esc</kbd>
          </div>
          <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
            {commands.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-ink-3">{searching && (txs.isFetching || tasks.isFetching) ? "Searching…" : `No results for “${q}”`}</li>
            )}
            {commands.map((c, idx) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <li key={c.id} role="option" aria-selected={idx === active}>
                  {header && <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-ink-3">{header}</p>}
                  <button data-idx={idx} onMouseMove={() => setActive(idx)} onClick={() => run(c)}
                    className={cn("flex w-full items-center gap-3 h-9 px-3 rounded-[9px] text-left text-sm", idx === active ? "bg-accent text-white" : "text-ink")}>
                    <span className={idx === active ? "text-white" : "text-ink-3"}>{c.icon}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className={cn("text-xs tnum", idx === active ? "text-white/85" : "text-ink-3")}>{c.hint}</span>}
                    {idx === active && <CornerDownLeft className="h-3.5 w-3.5 text-white/85" />}
                  </button>
                </li>
              );
            })}
            {searching && (txs.isFetching || tasks.isFetching) && commands.length > 0 && <li className="px-3 py-2 text-xs text-ink-3">Searching…</li>}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
