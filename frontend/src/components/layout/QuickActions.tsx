import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TransactionForm, type TxDraft } from "@/features/finance/TransactionForm";
import { TaskForm, type TaskDraft } from "@/features/tasks/TaskForm";
import type { Task, Transaction } from "@/lib/types";

interface QuickActions {
  newTransaction: (draft?: TxDraft) => void;
  editTransaction: (tx: Transaction) => void;
  newTask: (draft?: TaskDraft) => void;
  editTask: (task: Task) => void;
}

const Ctx = createContext<QuickActions | null>(null);

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Global create/edit dialogs for the two most frequent inputs, plus keyboard shortcuts:
 *  "t" → new transaction, "n" → new task. */
export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [tx, setTx] = useState<{ open: boolean; editing?: Transaction | null; draft?: TxDraft }>({ open: false });
  const [task, setTask] = useState<{ open: boolean; editing?: Task | null; draft?: TaskDraft }>({ open: false });

  const newTransaction = useCallback((draft?: TxDraft) => setTx({ open: true, editing: null, draft }), []);
  const editTransaction = useCallback((editing: Transaction) => setTx({ open: true, editing }), []);
  const newTask = useCallback((draft?: TaskDraft) => setTask({ open: true, editing: null, draft }), []);
  const editTask = useCallback((editing: Task) => setTask({ open: true, editing }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || document.querySelector("[role=dialog]")) return;
      if (e.key === "t") { e.preventDefault(); newTransaction(); }
      if (e.key === "n") { e.preventDefault(); newTask(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newTransaction, newTask]);

  const value = useMemo(() => ({ newTransaction, editTransaction, newTask, editTask }), [newTransaction, editTransaction, newTask, editTask]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <TransactionForm open={tx.open} editing={tx.editing} draft={tx.draft} onOpenChange={(open) => setTx((s) => ({ ...s, open }))} />
      <TaskForm open={task.open} editing={task.editing} draft={task.draft} onOpenChange={(open) => setTask((s) => ({ ...s, open }))} />
    </Ctx.Provider>
  );
}

export function useQuickActions(): QuickActions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuickActions outside provider");
  return ctx;
}
