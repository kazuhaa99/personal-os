import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney, FREQUENCY_LABEL, normalizeAmount } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Frequency, IncomeSource, Profile } from "@/lib/types";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Badge, Button, Card, CardHeader, cn, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { CURRENCIES, FREQUENCIES, PROFILE_KEY } from "./shared";

/** iOS-style switch. */
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-good" : "bg-fill/[0.16]")}>
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 36 }}
        className={cn("block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)]", checked ? "ml-[18px]" : "ml-[2px]")} />
    </button>
  );
}

// ------------------------------------------------------------------ salary

type SalaryForm = { amount: string; currency: string; frequency: Frequency; payday: string };
const salaryFrom = (p: Profile): SalaryForm => ({
  amount: p.salary_amount ? p.salary_amount.replace(/\.00$/, "") : "", currency: p.salary_currency || "KZT",
  frequency: p.salary_frequency || "monthly", payday: p.payday ? String(p.payday) : "",
});

function SalaryCard({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const initial = useMemo(() => salaryFrom(profile), [profile]);
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<{ amount?: string; payday?: string }>({});
  const prev = useRef(initial);
  useEffect(() => {
    const old = prev.current;
    prev.current = initial;
    setF((s) => (JSON.stringify(s) === JSON.stringify(old) ? initial : s));
  }, [initial]);

  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const save = useAction<Record<string, unknown>, Profile>((body) => api.patch<Profile>("/profile", body), {
    success: t("Income saved"), onSuccess: (p) => { qc.setQueryData<Profile>(PROFILE_KEY, p); },
  });

  function submit() {
    const e: typeof errors = {};
    const amount = f.amount.trim() ? normalizeAmount(f.amount) : null;
    if (f.amount.trim() && amount === null) e.amount = t("Enter an amount like 450000 or 450000.50");
    const pd = f.payday.trim() ? Number(f.payday) : null;
    if (pd !== null && (!Number.isInteger(pd) || pd < 1 || pd > 31)) e.payday = t("A day from 1 to 31");
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({ salary_amount: amount, salary_currency: f.currency, salary_frequency: f.frequency, payday: pd });
  }

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Banknote className="h-4 w-4 text-ink-3" /> {t("Income")}</span>}
        subtitle={t("Your main salary. It's used to estimate the income you can expect each month.")} />
      <form className="px-5 pb-5 space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); if (dirty) submit(); }}>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] sm:grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Field label={t("Salary")} error={errors.amount}>{(id) => (
            <Input id={id} inputMode="decimal" autoComplete="off" placeholder="0" value={f.amount} aria-invalid={!!errors.amount}
              className="tnum" onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />
          )}</Field>
          <Field label={t("Currency")}>{(id) => (
            <Select id={id} value={f.currency} onChange={(e) => setF((s) => ({ ...s, currency: e.target.value }))}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Paid")}>{(id) => (
            <Select id={id} value={f.frequency} onChange={(e) => setF((s) => ({ ...s, frequency: e.target.value as Frequency }))}>
              {FREQUENCIES.map((q) => <option key={q} value={q}>{FREQUENCY_LABEL[q]}</option>)}
            </Select>
          )}</Field>
          <Field label={t("Payday (optional)")} error={errors.payday} hint={t("Day of the month")}>{(id) => (
            <Input id={id} type="number" inputMode="numeric" min={1} max={31} placeholder="—" value={f.payday} aria-invalid={!!errors.payday}
              onChange={(e) => setF((s) => ({ ...s, payday: e.target.value }))} />
          )}</Field>
        </div>
        <Button type="submit" variant="primary" disabled={!dirty} loading={save.isPending}>{t("Save")}</Button>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ additional income

function SourceForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: IncomeSource | null }) {
  const [f, setF] = useState({ name: "", amount: "", currency: "KZT", frequency: "monthly" as Frequency, note: "" });
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      name: editing?.name ?? "", amount: editing ? editing.amount.replace(/\.00$/, "") : "", currency: editing?.currency ?? "KZT",
      frequency: editing?.frequency ?? "monthly", note: editing?.note ?? "",
    });
  }, [open, editing]);
  const save = useAction((body: Record<string, unknown>) => (editing ? api.patch(`/profile/incomes/${editing.id}`, body) : api.post("/profile/incomes", body)), { refresh: ["profile"],
    success: editing ? t("Income source updated") : t("Income source added"), onSuccess: () => onOpenChange(false),
  });

  function submit() {
    const e: typeof errors = {};
    if (!f.name.trim()) e.name = t("Give it a name");
    const amount = normalizeAmount(f.amount);
    if (!amount || amount === "0" || /^0+(\.0+)?$/.test(amount)) e.amount = t("Enter an amount like 450000 or 450000.50");
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({ name: f.name.trim(), amount, currency: f.currency, frequency: f.frequency, note: f.note.trim() || null });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editing ? t("Edit income source") : t("Add income")} onSubmit={submit}
      description={t("Freelance, rent, dividends — anything that comes in regularly.")}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{t("Save")}</Button></>}>
      <Field label={t("Name")} error={errors.name}>{(id) => <Input id={id} autoFocus value={f.name} maxLength={120} placeholder={t("e.g. Freelance design")} aria-invalid={!!errors.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} />}</Field>
      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
        <Field label={t("Amount")} error={errors.amount}>{(id) => <Input id={id} inputMode="decimal" className="tnum" placeholder="0" value={f.amount} aria-invalid={!!errors.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />}</Field>
        <Field label={t("Currency")}>{(id) => (
          <Select id={id} value={f.currency} onChange={(e) => setF((s) => ({ ...s, currency: e.target.value }))}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}</Field>
      </div>
      <Field label={t("How often")}>{(id) => (
        <Select id={id} value={f.frequency} onChange={(e) => setF((s) => ({ ...s, frequency: e.target.value as Frequency }))}>
          {FREQUENCIES.map((q) => <option key={q} value={q}>{FREQUENCY_LABEL[q]}</option>)}
        </Select>
      )}</Field>
      <Field label={t("Note (optional)")}>{(id) => <Textarea id={id} rows={2} value={f.note} maxLength={500} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} />}</Field>
    </Modal>
  );
}

function SourceRow({ source, onEdit }: { source: IncomeSource; onEdit: () => void }) {
  const confirm = useConfirm();
  const toggle = useAction((is_active: boolean) => api.patch(`/profile/incomes/${source.id}`, { is_active }), { refresh: ["profile"] });
  const remove = useAction(() => api.del(`/profile/incomes/${source.id}`), { refresh: ["profile"], success: t("Income source deleted") });
  const active = toggle.isPending ? !!toggle.variables : source.is_active;

  return (
    <motion.li layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
      className="flex items-center gap-3 px-5 py-3 border-t hairline first:border-t-0">
      <div className={cn("min-w-0 flex-1 transition-opacity", !active && "opacity-55")}>
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{source.name}</p>
          {!active && <Badge>{t("Paused")}</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-ink-3 tnum">
          <span className="text-ink-2">{formatMoney(source.amount, source.currency)}</span> · {FREQUENCY_LABEL[source.frequency]}
          {source.frequency !== "monthly" && <> · {t("≈ {amount} / month", { amount: formatMoney(source.monthly_amount, source.currency) })}</>}
        </p>
        {source.note && <p className="mt-0.5 text-xs text-ink-3 truncate">{source.note}</p>}
      </div>
      <Switch checked={active} disabled={toggle.isPending} onChange={(v) => toggle.mutate(v)} label={active ? t("Counted in monthly income") : t("Not counted in monthly income")} />
      <div className="flex shrink-0 -mr-2">
        <Button variant="ghost" size="icon" aria-label={t("Edit")} title={t("Edit")} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" aria-label={t("Delete")} title={t("Delete")} className="hover:text-bad" loading={remove.isPending}
          onClick={async () => { if (await confirm({ title: t("Delete “{name}”?", { name: source.name }) })) remove.mutate(undefined); }}>
          {!remove.isPending && <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </motion.li>
  );
}

function SourcesCard({ sources }: { sources: IncomeSource[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeSource | null>(null);
  const add = () => { setEditing(null); setOpen(true); };
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4 text-ink-3" /> {t("Additional income")}</span>}
        subtitle={t("Only active sources count towards the monthly estimate.")}
        action={sources.length > 0 && <Button size="sm" onClick={add} aria-label={t("Add income")} className="shrink-0"><Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("Add income")}</span></Button>} />
      {sources.length ? (
        <ul className="pb-2"><AnimatePresence initial={false}>
          {sources.map((s) => <SourceRow key={s.id} source={s} onEdit={() => { setEditing(s); setOpen(true); }} />)}
        </AnimatePresence></ul>
      ) : (
        <EmptyState className="py-8" icon={<Wallet className="h-6 w-6" />} title={t("No additional income yet")}
          body={t("Add side gigs, rent or dividends to see the full picture of what you earn.")}
          action={<Button size="sm" onClick={add}><Plus className="h-3.5 w-3.5" /> {t("Add income")}</Button>} />
      )}
      <SourceForm open={open} onOpenChange={setOpen} editing={editing} />
    </Card>
  );
}

export function IncomeSection({ profile }: { profile: Profile }) {
  return (
    <>
      <SalaryCard profile={profile} />
      <SourcesCard sources={profile.income_sources} />
    </>
  );
}
