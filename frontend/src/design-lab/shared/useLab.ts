import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeAmount } from "@/lib/format";
import { CATEGORIES, HABITS, INCOME_CATEGORIES, TASKS, TODAY, TRANSACTIONS, type Habit, type Task, type Tx, type TxType } from "../data";

/**
 * In-memory state for one concept prototype. Everything lives in React state
 * for the current session only: no API calls, no real records are touched.
 */
export function useLab() {
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [habits, setHabits] = useState<Habit[]>(HABITS);
  const [txs, setTxs] = useState<Tx[]>(TRANSACTIONS);
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
  const [txFilter, setTxFilter] = useState<"all" | TxType>("all");
  const [query, setQuery] = useState("");
  const [taskView, setTaskView] = useState<"today" | "upcoming" | "done">("today");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toastTimer = useRef<number>();

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const toggleTask = useCallback((id: string) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const toggleHabit = useCallback((id: string, day = 6) => {
    setHabits((hs) => hs.map((h) => {
      if (h.id !== id) return h;
      const week = h.week.map((v, i) => (i === day ? !v : v));
      let streak = 0;
      for (let i = 6; i >= 0; i--) { if (week[i]) streak++; else if (i !== 6) break; }
      return { ...h, week, streak };
    }));
  }, []);

  const visibleTasks = useMemo(() => {
    if (taskView === "done") return tasks.filter((t) => t.done);
    return tasks.filter((t) => t.when === taskView && !t.done);
  }, [tasks, taskView]);

  const visibleTxs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txs.filter((t) => (txFilter === "all" || t.type === txFilter)
      && (!q || `${t.title} ${t.category} ${t.account}`.toLowerCase().includes(q)));
  }, [txs, txFilter, query]);

  /** Simulated refresh to demonstrate loading states (no network). */
  const refresh = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 900);
  }, []);

  const addTask = useCallback((title: string) => {
    if (!title.trim()) return false;
    setTasks((ts) => [{ id: `n${Date.now()}`, title: title.trim(), priority: "medium", done: false, when: "today" }, ...ts]);
    return true;
  }, []);

  return {
    tasks, toggleTask, visibleTasks, taskView, setTaskView, addTask,
    habits, toggleHabit,
    txs, setTxs, visibleTxs, selectedTx, setSelectedTx, txFilter, setTxFilter, query, setQuery,
    toast, notify, loading, refresh,
    quick: useQuickAdd((tx) => { setTxs((t) => [tx, ...t]); notify("Added to this preview · not saved"); }),
  };
}
export type Lab = ReturnType<typeof useLab>;

export interface QuickForm { type: "expense" | "income"; amount: string; category: string; account: string; title: string; date: string }

/** Quick-add transaction form with validation identical to the real app's rules. */
export function useQuickAdd(onAdd: (tx: Tx) => void) {
  const blank: QuickForm = { type: "expense", amount: "", category: "", account: "Kaspi Gold", title: "", date: TODAY };
  const [open, setOpenState] = useState(false);
  const [form, setForm] = useState<QuickForm>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof QuickForm, string>>>({});
  const [shake, setShake] = useState(0);

  const setOpen = useCallback((o: boolean) => {
    setOpenState(o);
    if (o) { setForm(blank); setErrors({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = <K extends keyof QuickForm>(k: K, v: QuickForm[K]) => {
    setForm((f) => ({ ...f, [k]: v, ...(k === "type" ? { category: "" } : {}) }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const categories = CATEGORIES.filter((c) => (form.type === "income") === INCOME_CATEGORIES.has(c));

  function submit() {
    const e: typeof errors = {};
    const amt = normalizeAmount(form.amount);
    if (!form.amount.trim()) e.amount = "Enter an amount";
    else if (!amt || Number(amt) <= 0) e.amount = "Use a positive number with up to 2 decimals";
    if (!form.category) e.category = "Pick a category";
    if (!form.date) e.date = "Pick a date";
    setErrors(e);
    if (Object.keys(e).length) { setShake((s) => s + 1); return false; }
    onAdd({
      id: `s${Date.now()}`, date: form.date, title: form.title.trim() || form.category, category: form.category,
      account: form.account, amount: Number(amt).toFixed(2), type: form.type, session: true, note: "Added in this preview session — not saved",
    });
    setOpenState(false);
    return true;
  }
  return { open, setOpen, form, set, errors, submit, categories, shake };
}
export type Quick = ReturnType<typeof useQuickAdd>;
