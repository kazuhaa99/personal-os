import { useQuery } from "@tanstack/react-query";
import { addMonths, format, parseISO } from "date-fns";
import { AlertOctagon, AlertTriangle, ChevronLeft, ChevronRight, PiggyBank, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { formatMoney, monthLabel, normalizeAmount } from "@/lib/format";
import { useAction, useCategories } from "@/lib/queries";
import type { BudgetLine, BudgetMonth } from "@/lib/types";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Button, Card, cn, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Progress, Select } from "@/components/ui/primitives";

function BudgetForm({ open, onOpenChange, month, line, usedIds }: { open: boolean; onOpenChange: (o: boolean) => void; month: string; line: BudgetLine | null; usedIds: number[] }) {
  const { data: categories = [] } = useCategories();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setCategoryId(line ? String(line.category_id) : ""); setAmount(line?.limit ?? ""); setError(null); }
  }
  const save = useAction((body: Record<string, unknown>) => api.put("/budgets", body), { success: "Budget saved", onSuccess: () => onOpenChange(false) });
  const options = categories.filter((c) => c.kind === "expense" && !c.is_archived && (!usedIds.includes(c.id) || c.id === line?.category_id));

  function submit() {
    const amt = normalizeAmount(amount);
    if (!categoryId) return setError("Choose a category");
    if (!amt) return setError("Enter a monthly limit with at most 2 decimals");
    save.mutate({ category_id: Number(categoryId), month, amount: amt, is_active: true });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={line ? `Edit ${line.category_name} budget` : "New monthly budget"} onSubmit={submit}
      description={`Applies from ${monthLabel(month, "MMMM yyyy")} onward. Earlier months keep their previous limit.`}
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="primary" loading={save.isPending}>Save</Button></>}>
      <Field label="Expense category">{(id) => (
        <Select id={id} value={categoryId} disabled={!!line} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Select…</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      )}</Field>
      <Field label="Monthly limit" error={error}>{(id) => <Input id={id} autoFocus inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
    </Modal>
  );
}

export function BudgetsPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? format(new Date(), "yyyy-MM");
  const confirm = useConfirm();
  const [form, setForm] = useState<{ open: boolean; line: BudgetLine | null }>({ open: false, line: null });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["budgets", month], queryFn: () => api.get<BudgetMonth>("/budgets", { month }) });
  const disable = useAction((line: BudgetLine) => api.put("/budgets", { category_id: line.category_id, month, amount: line.limit, is_active: false }), { success: "Budget disabled from this month" });
  const shift = (n: number) => setParams({ month: format(addMonths(parseISO(`${month}-01`), n), "yyyy-MM") });

  async function onDisable(line: BudgetLine) {
    if (await confirm({ title: `Disable ${line.category_name} budget?`, body: `No limit will apply from ${monthLabel(month, "MMMM yyyy")} on. Earlier months are unchanged.`, confirmLabel: "Disable" })) disable.mutate(line);
  }

  const cur = data?.currency ?? "KZT";
  const totalUtil = data && Number(data.total_limit) > 0 ? (Number(data.total_spent_budgeted) / Number(data.total_limit)) * 100 : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="text-base font-medium w-36 text-center">{monthLabel(month, "MMMM yyyy")}</p>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button variant="primary" onClick={() => setForm({ open: true, line: null })}><Plus className="h-4 w-4" /> Set budget</Button>
      </div>

      {isLoading ? <LoadingBlock /> : error || !data ? <ErrorBlock error={error} onRetry={() => refetch()} /> : data.lines.length === 0 ? (
        <Card><EmptyState icon={<PiggyBank className="h-6 w-6" />} title="No budgets for this month" body="Set monthly limits for the categories you want to keep an eye on. Spending is measured from actual expense transactions." action={<Button variant="primary" onClick={() => setForm({ open: true, line: null })}>Set a budget</Button>} /></Card>
      ) : (
        <>
          <Card className="px-5 py-4 flex flex-wrap items-center gap-x-10 gap-y-3">
            <div>
              <p className="text-xs text-ink-3">Spent in budgeted categories</p>
              <p className="text-2xl font-semibold tnum mt-1">{formatMoney(data.total_spent_budgeted, cur)} <span className="text-sm font-normal text-ink-3">of {formatMoney(data.total_limit, cur)}</span></p>
            </div>
            <div className="flex-1 min-w-[12rem]">
              {totalUtil !== null && <Progress value={totalUtil} tone={totalUtil > 100 ? "bad" : totalUtil >= 85 ? "warn" : "accent"} label="Total budget utilization" />}
            </div>
            <div>
              <p className="text-xs text-ink-3">Unbudgeted spending</p>
              <Link to={`/finances/transactions?type=expense&start=${month}-01&end=${format(addMonths(parseISO(`${month}-01`), 1).getTime() - 86400000, "yyyy-MM-dd")}`} className="text-base tnum hover:text-accent">{formatMoney(data.unbudgeted_spent, cur)}</Link>
            </div>
          </Card>
          <Card className="divide-y divide-line/[0.08]">
            {data.lines.map((l) => {
              const util = l.utilization ? Number(l.utilization) : 0;
              const tone = l.status === "over" ? "bad" : l.status === "warning" ? "warn" : "accent";
              return (
                <div key={l.category_id} className="group px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                      {l.category_name}
                      {l.status === "over" && <span className="inline-flex items-center gap-1 text-xs text-bad font-normal"><AlertOctagon className="h-3.5 w-3.5" /> Over budget</span>}
                      {l.status === "warning" && <span className="inline-flex items-center gap-1 text-xs text-warn font-normal"><AlertTriangle className="h-3.5 w-3.5" /> Nearly used</span>}
                    </p>
                    <p className="text-sm tnum">
                      {formatMoney(l.spent, cur)} <span className="text-ink-3">/ {formatMoney(l.limit, cur)}</span>
                      <span className={cn("ml-3", l.remaining.startsWith("-") ? "text-bad" : "text-ink-2")}>
                        {l.remaining.startsWith("-") ? `${formatMoney(l.remaining.slice(1), cur)} over` : `${formatMoney(l.remaining, cur)} left`}
                      </span>
                    </p>
                  </div>
                  <Progress className="mt-2" value={util} tone={tone} label={`${l.category_name} utilization`} />
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-3">
                    <span className="tnum">{l.utilization ?? "—"}% used</span>
                    <span className="tnum">Last month: {formatMoney(l.previous_month_spent, cur)}</span>
                    <span className="tnum">3-month avg: {l.average_3m_spent === null ? "not enough history" : formatMoney(l.average_3m_spent, cur)}</span>
                    <span>Limit since {monthLabel(l.effective_since)}</span>
                    <span className="ml-auto flex gap-1 opacity-70 group-hover:opacity-100">
                      <Button size="sm" variant="ghost" onClick={() => setForm({ open: true, line: l })}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => onDisable(l)}>Disable</Button>
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
          <p className="text-xs text-ink-3 px-1">{data.note}</p>
        </>
      )}
      <BudgetForm open={form.open} line={form.line} month={month} usedIds={data?.lines.map((l) => l.category_id) ?? []} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
    </div>
  );
}
