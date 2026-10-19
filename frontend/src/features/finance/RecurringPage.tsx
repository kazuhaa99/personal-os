import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t, tp } from "@/lib/i18n";
import { fmtDate, formatMoney, FREQUENCY_LABEL, normalizeAmount, relativeDay, todayISO } from "@/lib/format";
import { useAccounts, useAction, useCategories } from "@/lib/queries";
import type { ExpectedPayment, Frequency, RecurringRule } from "@/lib/types";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Badge, Button, Card, CardHeader, cn, DemoBadge, EmptyState, Field, Input, LoadingBlock, MoneyText, Segmented, Select } from "@/components/ui/primitives";

function RuleForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: RecurringRule | null }) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [payee, setPayee] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setType(editing?.type ?? "expense");
    setName(editing?.name ?? "");
    setAmount(editing?.amount ?? "");
    setFrequency(editing?.frequency ?? "monthly");
    setStart(editing?.start_date ?? todayISO());
    setEnd(editing?.end_date ?? "");
    setAccountId(String(editing?.account.id ?? accounts.find((a) => !a.is_archived)?.id ?? ""));
    setCategoryId(String(editing?.category.id ?? ""));
    setPayee(editing?.payee ?? "");
  }, [open, editing, accounts]);

  const save = useAction((body: Record<string, unknown>) => (editing ? api.patch(`/recurring/${editing.id}`, body) : api.post("/recurring", body)), {
    success: editing ? t("Recurring payment updated") : t("Recurring payment added"), onSuccess: () => onOpenChange(false),
  });

  function submit() {
    const e: Record<string, string> = {};
    const amt = normalizeAmount(amount);
    if (!name.trim()) e.name = t("Name it");
    if (!amt || Number(amt) <= 0) e.amount = t("Enter an amount greater than 0");
    if (!accountId) e.account = t("Choose an account");
    if (!categoryId) e.category = t("Choose a category");
    if (end && end < start) e.end = t("End must be after start");
    setErrors(e);
    if (Object.keys(e).length) return;
    const common = { name: name.trim(), amount: amt, end_date: end || null, account_id: Number(accountId), category_id: Number(categoryId), payee: payee.trim() || null };
    save.mutate(editing ? common : { ...common, type, frequency, start_date: start });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editing ? t("Edit recurring payment") : t("New recurring payment")} onSubmit={submit}
      description={t("A rule only describes what you expect. It never moves money until you confirm an occurrence.")}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{t("Save")}</Button></>}>
      {!editing && <Segmented value={type} onChange={(t) => { setType(t); setCategoryId(""); }} options={[{ value: "expense", label: t("Expense") }, { value: "income", label: t("Income") }]} />}
      <Field label={t("Name")} error={errors.name}>{(id) => <Input id={id} autoFocus value={name} maxLength={80} placeholder={t("e.g. Internet, Rent, Salary")} onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Amount")} error={errors.amount}>{(id) => <Input id={id} inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label={t("Frequency")}>{(id) => (
          <Select id={id} value={frequency} disabled={!!editing} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {Object.entries(FREQUENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        )}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("First date")} hint={editing ? t("Schedule start can't change") : t("Day of month is kept (31st → last day)")}>{(id) => <Input id={id} type="date" value={start} disabled={!!editing} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label={t("End date (optional)")} error={errors.end}>{(id) => <Input id={id} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Account")} error={errors.account}>{(id) => (
          <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t("Select…")}</option>
            {accounts.filter((a) => !a.is_archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}</Field>
        <Field label={t("Category")} error={errors.category}>{(id) => (
          <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("Select…")}</option>
            {categories.filter((c) => c.kind === type && !c.is_archived).map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}
          </Select>
        )}</Field>
      </div>
      <Field label={t("Payee (optional)")}>{(id) => <Input id={id} value={payee} maxLength={120} onChange={(e) => setPayee(e.target.value)} />}</Field>
    </Modal>
  );
}

function ConfirmDialog({ item, onClose }: { item: ExpectedPayment | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (item) { setAmount(item.amount); setDate(item.due_date > todayISO() ? todayISO() : item.due_date); setError(null); } }, [item]);
  const confirm = useAction((body: Record<string, unknown>) => api.post(`/recurring/${item!.source_id}/confirm`, body), { success: t("Recorded as a transaction"), onSuccess: onClose });
  return (
    <Modal open={!!item} onOpenChange={(o) => !o && onClose()} title={t("Record “{name}”", { name: item?.name ?? "" })}
      description={item ? t("Scheduled for {date}. Recording creates one real transaction; recording the same occurrence twice is blocked.", { date: fmtDate(item.due_date) }) : undefined}
      onSubmit={() => {
        const amt = normalizeAmount(amount);
        if (!amt || Number(amt) <= 0) return setError(t("Enter the actual amount"));
        confirm.mutate({ occurrence_date: item!.due_date, actual_date: date, amount: amt });
      }}
      footer={<><Button onClick={onClose}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={confirm.isPending}>{t("Record transaction")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Actual amount")} error={error}>{(id) => <Input id={id} autoFocus inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label={t("Actual date")}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

export function RecurringPage() {
  const { data: rules, isLoading } = useQuery({ queryKey: ["recurring"], queryFn: () => api.get<RecurringRule[]>("/recurring") });
  const { data: expected = [] } = useQuery({ queryKey: ["expected", 45], queryFn: () => api.get<ExpectedPayment[]>("/recurring/expected", { days: 45 }) });
  const confirmDel = useConfirm();
  const [form, setForm] = useState<{ open: boolean; editing: RecurringRule | null }>({ open: false, editing: null });
  const [confirming, setConfirming] = useState<ExpectedPayment | null>(null);
  const toggle = useAction((r: RecurringRule) => api.patch(`/recurring/${r.id}`, { is_active: !r.is_active }), { success: t("Updated") });
  const skip = useAction((p: ExpectedPayment) => api.post(`/recurring/${p.source_id}/skip`, { occurrence_date: p.due_date }), { success: t("Occurrence skipped") });
  const remove = useAction((id: number) => api.del(`/recurring/${id}`), { success: t("Recurring payment deleted") });
  const today = todayISO();
  const recurringExpected = expected.filter((e) => e.kind === "recurring");
  const rulesById = Object.fromEntries((rules ?? []).map((r) => [r.id, r]));

  const monthlyOut = (rules ?? []).filter((r) => r.is_active && r.type === "expense");
  async function onDelete(r: RecurringRule) {
    if (await confirmDel({ title: t("Delete “{name}”?", { name: r.name }), body: t("Transactions already recorded from this rule are kept.") })) remove.mutate(r.id);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      <Card>
        <CardHeader title={t("Expected in the next 45 days")} subtitle={t("Projected — record each one once it actually happens.")} />
        {recurringExpected.length === 0 ? (
          <EmptyState className="py-8" icon={<CalendarClock className="h-6 w-6" />} title={t("Nothing expected")} body={t("Active recurring rules show their upcoming occurrences here.")} />
        ) : (
          <ul className="px-2 pb-2">
            {recurringExpected.map((p) => (
              <li key={`${p.source_id}-${p.due_date}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-fill/[0.03]">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{p.name}</p>
                  <p className={cn("text-xs", p.overdue ? "text-bad" : "text-ink-3")}>{p.overdue ? `${t("Overdue")} · ` : ""}{relativeDay(p.due_date, today)} · {fmtDate(p.due_date, "d MMM")} · {p.account_name}</p>
                </div>
                <MoneyText value={p.type === "expense" ? `-${p.amount}` : p.amount} currency={p.currency} signed className="text-sm" />
                <Button size="sm" variant={p.overdue || p.due_date <= today ? "primary" : "secondary"} onClick={() => setConfirming(p)}><CheckCircle2 className="h-3.5 w-3.5" /> {t("Record")}</Button>
                {rulesById[p.source_id]?.next_due_date === p.due_date && (
                  <Button size="icon" variant="ghost" aria-label={t("Skip this occurrence")} title={t("Skip (didn't happen)")} onClick={() => skip.mutate(p)}><SkipForward className="h-3.5 w-3.5" /></Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-3">{monthlyOut.length ? tp("{n} active expense rule", monthlyOut.length) : ""}</p>
          <Button variant="primary" onClick={() => setForm({ open: true, editing: null })}><Plus className="h-4 w-4" /> {t("New rule")}</Button>
        </div>
        {isLoading ? <LoadingBlock /> : !rules?.length ? (
          <Card><EmptyState title={t("No recurring payments")} body={t("Register subscriptions, rent, salary and other repeating money so they show up before they happen.")} action={<Button variant="primary" onClick={() => setForm({ open: true, editing: null })}>{t("Add a rule")}</Button>} /></Card>
        ) : (
          <Card className="divide-y divide-line/[0.08]">
            {rules.map((r) => (
              <div key={r.id} className={cn("group flex items-center gap-4 px-5 py-3.5", !r.is_active && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.name}<DemoBadge show={r.is_demo} />{!r.is_active && <Badge className="ml-2">{t("paused")}</Badge>}</p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    {FREQUENCY_LABEL[r.frequency]} · {t(r.category.name)} · {r.account.name} · {t("next {date}", { date: r.next_due_date ? fmtDate(r.next_due_date, "d MMM") : "—" })}
                    {r.frequency !== "monthly" && ` · ≈ ${t("{amount}/mo", { amount: formatMoney(r.monthly_equivalent, r.currency) })}`} · {tp("{n} recorded", r.confirmed_count)}
                  </p>
                </div>
                <MoneyText value={r.type === "expense" ? `-${r.amount}` : r.amount} currency={r.currency} signed colored={r.type === "income"} className="text-sm" />
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label={t("Edit")} onClick={() => setForm({ open: true, editing: r })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" aria-label={r.is_active ? t("Pause") : t("Resume")} onClick={() => toggle.mutate(r)}>{r.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</Button>
                  <Button variant="ghost" size="icon" aria-label={t("Delete")} onClick={() => onDelete(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
      <RuleForm open={form.open} editing={form.editing} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
      <ConfirmDialog item={confirming} onClose={() => setConfirming(null)} />
    </div>
  );
}
