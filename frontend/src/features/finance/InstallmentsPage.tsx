import { useQuery } from "@tanstack/react-query";
import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t, tp } from "@/lib/i18n";
import { fmtDate, formatMoney, FREQUENCY_LABEL, normalizeAmount, todayISO } from "@/lib/format";
import { useAccounts, useAction } from "@/lib/queries";
import type { Frequency, InstallmentPlan } from "@/lib/types";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Badge, Button, Card, Checkbox, cn, DemoBadge, EmptyState, Field, Input, LoadingBlock, MoneyText, Progress, Select, Textarea } from "@/components/ui/primitives";

const STATUS_TONE = { active: "accent", paused: "neutral", paid_off: "good", cancelled: "neutral" } as const;
const statusLabel = (s: keyof typeof STATUS_TONE) => ({ active: t("active"), paused: t("paused"), paid_off: t("paid off"), cancelled: t("cancelled") })[s] ?? s;

function PlanForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: InstallmentPlan | null }) {
  const { data: accounts = [] } = useAccounts();
  const [f, setF] = useState({ name: "", lender: "", currency: "KZT", original: "", outstanding: "", payment: "", frequency: "monthly" as Frequency, next: "", final: "", account: "", notes: "", status: "active" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      name: editing?.name ?? "", lender: editing?.lender ?? "", currency: editing?.currency ?? "KZT",
      original: editing?.original_amount ?? "", outstanding: editing ? editing.starting_outstanding : "",
      payment: editing?.payment_amount ?? "", frequency: editing?.frequency ?? "monthly",
      next: editing?.next_payment_date ?? "", final: editing?.final_payment_date ?? "",
      account: String(editing?.default_account_id ?? ""), notes: editing?.notes ?? "", status: editing?.status ?? "active",
    });
  }, [open, editing]);

  const save = useAction((body: Record<string, unknown>) => (editing ? api.patch(`/installments/${editing.id}`, body) : api.post("/installments", body)), {
    success: editing ? t("Plan updated") : t("Plan added"), onSuccess: () => onOpenChange(false),
  });

  function submit() {
    const e: Record<string, string> = {};
    const original = normalizeAmount(f.original);
    const outstanding = f.outstanding ? normalizeAmount(f.outstanding) : null;
    const payment = normalizeAmount(f.payment);
    if (!f.name.trim()) e.name = t("Name it");
    if (!editing && (!original || Number(original) <= 0)) e.original = t("Enter the total amount");
    if (!editing && f.outstanding && outstanding === null) e.outstanding = t("Invalid amount");
    if (!editing && original && outstanding && Number(outstanding) > Number(original)) e.outstanding = t("Can't exceed the original amount");
    if (!payment || Number(payment) <= 0) e.payment = t("Enter the regular payment");
    setErrors(e);
    if (Object.keys(e).length) return;
    const common = {
      name: f.name.trim(), lender: f.lender.trim() || null, payment_amount: payment, frequency: f.frequency,
      next_payment_date: f.next || null, final_payment_date: f.final || null,
      default_account_id: f.account ? Number(f.account) : null, notes: f.notes.trim() || null,
    };
    save.mutate(editing
      ? { ...common, ...(editing.status !== "paid_off" ? { status: f.status } : {}) }
      : { ...common, currency: f.currency, original_amount: original, outstanding_amount: outstanding });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} wide title={editing ? t("Edit installment plan") : t("New installment plan")} onSubmit={submit}
      description={t("Tracking an obligation doesn't change any account balance. Balances change only when you record a payment as a transaction.")}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{t("Save")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Name")} error={errors.name}>{(id) => <Input id={id} autoFocus value={f.name} maxLength={80} placeholder={t("e.g. Laptop 0-0-12")} onChange={set("name")} />}</Field>
        <Field label={t("Lender / store (optional)")}>{(id) => <Input id={id} value={f.lender} maxLength={120} onChange={set("lender")} />}</Field>
      </div>
      {!editing && (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("Original amount")} error={errors.original}>{(id) => <Input id={id} inputMode="decimal" className="tnum" value={f.original} onChange={set("original")} />}</Field>
          <Field label={t("Still outstanding")} error={errors.outstanding} hint={t("Leave empty if nothing is paid yet")}>{(id) => <Input id={id} inputMode="decimal" className="tnum" value={f.outstanding} onChange={set("outstanding")} />}</Field>
          <Field label={t("Currency")}>{(id) => <Input id={id} value={f.currency} maxLength={3} onChange={(e) => setF((s) => ({ ...s, currency: e.target.value.toUpperCase() }))} />}</Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Regular payment")} error={errors.payment}>{(id) => <Input id={id} inputMode="decimal" className="tnum" value={f.payment} onChange={set("payment")} />}</Field>
        <Field label={t("Frequency")}>{(id) => (
          <Select id={id} value={f.frequency} onChange={set("frequency")}>
            {Object.entries(FREQUENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        )}</Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t("Next payment date")}>{(id) => <Input id={id} type="date" value={f.next} onChange={set("next")} />}</Field>
        <Field label={t("Final payment (optional)")}>{(id) => <Input id={id} type="date" value={f.final} onChange={set("final")} />}</Field>
        <Field label={t("Pay from (default)")}>{(id) => (
          <Select id={id} value={f.account} onChange={set("account")}>
            <option value="">{t("None")}</option>
            {accounts.filter((a) => !a.is_archived && a.currency === f.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}</Field>
      </div>
      {editing && editing.status !== "paid_off" && (
        <Field label={t("Status")}>{(id) => (
          <Select id={id} value={f.status} onChange={set("status")}>
            {(["active", "paused", "cancelled"] as const).map((v) => { const l = statusLabel(v); return <option key={v} value={v}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>; })}
          </Select>
        )}</Field>
      )}
      <Field label={t("Notes")}>{(id) => <Textarea id={id} value={f.notes} onChange={set("notes")} />}</Field>
    </Modal>
  );
}

function PaymentForm({ plan, onClose }: { plan: InstallmentPlan | null; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [account, setAccount] = useState("");
  const [recordTx, setRecordTx] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!plan) return;
    const min = Number(plan.payment_amount) < Number(plan.outstanding) ? plan.payment_amount : plan.outstanding;
    setAmount(min); setDate(todayISO()); setAccount(String(plan.default_account_id ?? "")); setRecordTx(true); setError(null);
  }, [plan]);
  const save = useAction((body: Record<string, unknown>) => api.post(`/installments/${plan!.id}/payments`, body), { success: t("Payment recorded"), onSuccess: onClose });

  return (
    <Modal open={!!plan} onOpenChange={(o) => !o && onClose()} title={`${t("Record payment")} · ${plan?.name ?? ""}`}
      description={plan ? t("Outstanding: {amount}.", { amount: formatMoney(plan.outstanding, plan.currency) }) : undefined}
      onSubmit={() => {
        const amt = normalizeAmount(amount);
        if (!amt || Number(amt) <= 0) return setError(t("Enter the amount paid"));
        if (recordTx && !account) return setError(t("Choose the account the payment came from"));
        save.mutate({ date, amount: amt, record_transaction: recordTx, account_id: recordTx ? Number(account) : null });
      }}
      footer={<><Button onClick={onClose}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{t("Record payment")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Amount")} error={error}>{(id) => <Input id={id} autoFocus inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label={t("Date")}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
      <Checkbox checked={recordTx} onChange={setRecordTx} label={t("Also record an expense transaction (moves money out of an account)")} />
      {recordTx ? (
        <Field label={t("Paid from")}>{(id) => (
          <Select id={id} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">{t("Select…")}</option>
            {accounts.filter((a) => !a.is_archived && a.currency === plan?.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}</Field>
      ) : (
        <p className="text-xs text-ink-3">{t("Only the outstanding balance will be reduced — use this if the payment is already recorded as a transaction or was paid from outside your tracked accounts.")}</p>
      )}
    </Modal>
  );
}

export function InstallmentsPage() {
  const { data: plans, isLoading } = useQuery({ queryKey: ["installments"], queryFn: () => api.get<InstallmentPlan[]>("/installments") });
  const confirm = useConfirm();
  const [form, setForm] = useState<{ open: boolean; editing: InstallmentPlan | null }>({ open: false, editing: null });
  const [paying, setPaying] = useState<InstallmentPlan | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const delPayment = useAction(({ plan, id }: { plan: number; id: number }) => api.del(`/installments/${plan}/payments/${id}`), { success: t("Payment deleted") });
  const delPlan = useAction((id: number) => api.del(`/installments/${id}`), { success: t("Plan deleted") });

  const totals = (plans ?? []).filter((p) => p.status === "active" || p.status === "paused");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-3">{totals.length ? `${tp("{n} open obligation", totals.length)}. ${t("Outstanding totals are on the Overview and in Analytics.")}` : ""}</p>
        <Button variant="primary" onClick={() => setForm({ open: true, editing: null })}><Plus className="h-4 w-4" /> {t("New plan")}</Button>
      </div>
      {isLoading ? <LoadingBlock /> : !plans?.length ? (
        <Card><EmptyState icon={<CreditCard className="h-6 w-6" />} title={t("No installment plans")} body={t("Track installment purchases, loans or money you owe. You'll see what's left and when it will be paid off.")} action={<Button variant="primary" onClick={() => setForm({ open: true, editing: null })}>{t("Add a plan")}</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className={cn("p-5", (p.status === "cancelled" || p.status === "paid_off") && "opacity-75")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}<DemoBadge show={p.is_demo} /></p>
                  <p className="text-xs text-ink-3 mt-0.5">{p.lender ? `${p.lender} · ` : ""}{formatMoney(p.payment_amount, p.currency)} {FREQUENCY_LABEL[p.frequency].toLowerCase()}</p>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-3">{t("Outstanding")}</p>
                  <p className="text-2xl font-semibold tnum">{formatMoney(p.outstanding, p.currency)}</p>
                </div>
                <p className="text-xs text-ink-3 text-right tnum">{t("Paid {amount}", { amount: formatMoney(p.paid_amount, p.currency) })}<br />{t("of {amount} total", { amount: formatMoney(p.original_amount, p.currency) })}</p>
              </div>
              <Progress className="mt-3" value={p.progress ? Number(p.progress) : 0} tone={p.status === "paid_off" ? "good" : "accent"} label={t("{name} repaid", { name: p.name })} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-ink-3">{t("Next payment")}</p><p className="text-ink-2 mt-0.5">{p.next_payment_date ? fmtDate(p.next_payment_date) : "—"}</p></div>
                <div><p className="text-ink-3">{t("Estimated payoff")}</p><p className="text-ink-2 mt-0.5">{p.estimated_payoff_date ? fmtDate(p.estimated_payoff_date, "MMM yyyy") : p.status === "paid_off" ? t("Done") : "—"}{p.remaining_payments_estimate ? ` · ${tp("{n} left", p.remaining_payments_estimate)}` : ""}</p></div>
              </div>
              <p className="mt-2 text-2xs text-ink-3">{p.estimate_note}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(p.status === "active" || p.status === "paused") && <Button size="sm" variant="primary" onClick={() => setPaying(p)}>{t("Record payment")}</Button>}
                <Button size="sm" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{expanded === p.id ? t("Hide") : t("History")} ({p.payments.length})</Button>
                <Button size="sm" variant="ghost" onClick={() => setForm({ open: true, editing: p })}><Pencil className="h-3.5 w-3.5" /> {t("Edit")}</Button>
                {p.payments.length === 0 && (
                  <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={async () => { if (await confirm({ title: t("Delete “{name}”?", { name: p.name }) })) delPlan.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
              {expanded === p.id && (
                <ul className="mt-3 border-t hairline pt-2 text-sm">
                  {p.payments.length === 0 && <li className="text-xs text-ink-3 py-1">{t("No payments recorded.")}</li>}
                  {[...p.payments].reverse().map((pay) => (
                    <li key={pay.id} className="flex items-center gap-3 py-1.5">
                      <span className="text-ink-2 tnum w-24">{fmtDate(pay.date, "d MMM yy")}</span>
                      <MoneyText value={pay.amount} currency={p.currency} className="flex-1" />
                      <span className="text-2xs text-ink-3">{pay.transaction_id ? t("with transaction") : t("liability only")}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("Delete payment")} onClick={async () => {
                        if (await confirm({ title: t("Delete this payment?"), body: pay.transaction_id ? t("Its expense transaction is deleted too, and the outstanding balance goes back up.") : t("The outstanding balance goes back up.") })) delPayment.mutate({ plan: p.id, id: pay.id });
                      }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      <PlanForm open={form.open} editing={form.editing} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
      <PaymentForm plan={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
