import { Archive, ArchiveRestore, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ACCOUNT_TYPE_LABEL, fmtDate, formatMoney, todayISO } from "@/lib/format";
import { useAccounts, useAction, useCategories } from "@/lib/queries";
import type { Account, AccountType, Category } from "@/lib/types";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Badge, Button, Card, CardHeader, cn, DemoBadge, EmptyState, Field, Input, LoadingBlock, MoneyText, Select, Textarea } from "@/components/ui/primitives";

function AccountForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Account | null }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [currency, setCurrency] = useState("KZT");
  const [opening, setOpening] = useState("0");
  const [openingDate, setOpeningDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setName(editing?.name ?? "");
    setType(editing?.type ?? "bank");
    setCurrency(editing?.currency ?? "KZT");
    setOpening(editing?.opening_balance ?? "0");
    setOpeningDate(editing?.opening_date ?? todayISO());
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const save = useAction((body: Record<string, unknown>) => (editing ? api.patch(`/accounts/${editing.id}`, body) : api.post("/accounts", body)), {
    success: editing ? "Account updated" : "Account created", onSuccess: () => onOpenChange(false),
  });

  function submit() {
    const e: Record<string, string> = {};
    const amt = opening.replace(/[\s ]/g, "").replace(",", ".");
    if (!name.trim()) e.name = "Name the account";
    if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(amt)) e.opening = "Enter a number with at most 2 decimals";
    if (!/^[A-Z]{3}$/.test(currency)) e.currency = "3-letter code, e.g. KZT";
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: Record<string, unknown> = { name: name.trim(), type, opening_balance: amt, opening_date: openingDate, notes: notes.trim() || null };
    if (!editing) body.currency = currency;
    save.mutate(body);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editing ? "Edit account" : "New account"} onSubmit={submit}
      description="The current balance is always calculated: opening balance plus every recorded transaction."
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="primary" loading={save.isPending}>Save</Button></>}>
      <Field label="Name" error={errors.name}>{(id) => <Input id={id} autoFocus value={name} maxLength={80} placeholder="e.g. Kaspi Gold" onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">{(id) => (
          <Select id={id} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        )}</Field>
        <Field label="Currency" error={errors.currency} hint={editing ? "Currency can't change once created" : "KZT is the primary currency"}>
          {(id) => <Input id={id} value={currency} disabled={!!editing} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance" error={errors.opening}>{(id) => <Input id={id} inputMode="decimal" className="tnum" value={opening} onChange={(e) => setOpening(e.target.value)} />}</Field>
        <Field label="Opening date" hint="Transactions can't be dated earlier">{(id) => <Input id={id} type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />}</Field>
      </div>
      <Field label="Notes">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
    </Modal>
  );
}

function CategoryManager() {
  const { data: categories = [] } = useCategories();
  const confirm = useConfirm();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b8b94");
  const create = useAction(() => api.post("/categories", { name: name.trim(), kind, color }), { success: "Category added", onSuccess: () => setName("") });
  const update = useAction(({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/categories/${id}`, body));
  const remove = useAction((id: number) => api.del(`/categories/${id}`), { success: "Category deleted" });
  const list = categories.filter((c) => c.kind === kind);

  async function onDelete(c: Category) {
    if (await confirm({ title: `Delete “${c.name}”?`, body: "Only unused categories can be deleted. Categories with history should be archived instead." })) remove.mutate(c.id);
  }

  return (
    <Card>
      <CardHeader title="Categories" subtitle="Transfers never use a category." action={
        <Select className="w-auto h-8" value={kind} onChange={(e) => setKind(e.target.value as "expense" | "income")} aria-label="Category kind">
          <option value="expense">Expense</option><option value="income">Income</option>
        </Select>
      } />
      <form className="flex gap-2 px-5 pb-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(undefined); }}>
        <input type="color" aria-label="Color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 rounded-lg bg-transparent border hairline p-1" />
        <Input placeholder={`New ${kind} category`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim()} loading={create.isPending}><Plus className="h-4 w-4" /></Button>
      </form>
      <ul className="px-2 pb-2 max-h-[28rem] overflow-y-auto">
        {list.map((c) => (
          <li key={c.id} className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.03]">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
            <span className={cn("text-sm flex-1 truncate", c.is_archived && "text-ink-3 line-through")}>{c.name}</span>
            {c.is_system && <Badge>system</Badge>}
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 group-hover:opacity-100" aria-label={c.is_archived ? "Unarchive" : "Archive"}
              onClick={() => update.mutate({ id: c.id, body: { is_archived: !c.is_archived } })}>
              {c.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
            {!c.is_system && <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 group-hover:opacity-100" aria-label="Delete" onClick={() => onDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ open: boolean; editing: Account | null }>({ open: false, editing: null });
  const archive = useAction(({ id, value }: { id: number; value: boolean }) => api.patch(`/accounts/${id}`, { is_archived: value }), { success: "Account updated" });
  const remove = useAction((id: number) => api.del(`/accounts/${id}`), { success: "Account deleted" });

  const active = (accounts ?? []).filter((a) => !a.is_archived);
  const archived = (accounts ?? []).filter((a) => a.is_archived);
  const totals = active.reduce<Record<string, string[]>>((acc, a) => { (acc[a.currency] ??= []).push(a.current_balance); return acc; }, {});

  async function onDelete(a: Account) {
    if (await confirm({ title: `Delete “${a.name}”?`, body: "Only accounts without transactions can be deleted. Archive accounts that have history." })) remove.mutate(a.id);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-3">{Object.keys(totals).length > 0 ? `${active.length} active account${active.length === 1 ? "" : "s"}` : ""}</p>
          <Button variant="primary" onClick={() => setForm({ open: true, editing: null })}><Plus className="h-4 w-4" /> New account</Button>
        </div>
        {isLoading ? <LoadingBlock /> : !accounts?.length ? (
          <Card><EmptyState icon={<Landmark className="h-6 w-6" />} title="Add your first account" body="Cash, bank cards, savings deposits — anything you want to track. Use the actual balance today as the opening balance." action={<Button variant="primary" onClick={() => setForm({ open: true, editing: null })}>New account</Button>} /></Card>
        ) : (
          <Card className="divide-y divide-white/[0.06]">
            {[...active, ...archived].map((a) => (
              <div key={a.id} className={cn("group flex items-center gap-4 px-5 py-3.5", a.is_archived && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    <Link to={`/finances/transactions?account_id=${a.id}`} className="hover:text-accent">{a.name}</Link>
                    <DemoBadge show={a.is_demo} />
                    {a.is_archived && <Badge className="ml-2">archived</Badge>}
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5">{ACCOUNT_TYPE_LABEL[a.type]} · {a.currency} · opened {fmtDate(a.opening_date)} with {formatMoney(a.opening_balance, a.currency)} · {a.transaction_count} transactions</p>
                </div>
                <MoneyText value={a.current_balance} currency={a.currency} className={cn("text-base font-medium", a.current_balance.startsWith("-") && "text-bad")} />
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setForm({ open: true, editing: a })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" aria-label={a.is_archived ? "Unarchive" : "Archive"} onClick={() => archive.mutate({ id: a.id, value: !a.is_archived })}>
                    {a.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </Button>
                  {a.transaction_count === 0 && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => onDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              </div>
            ))}
          </Card>
        )}
        <p className="text-xs text-ink-3 px-1">Archiving requires a zero balance so no money silently disappears from your totals. Archived accounts keep their full history.</p>
      </div>
      <CategoryManager />
      <AccountForm open={form.open} editing={form.editing} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
    </div>
  );
}
