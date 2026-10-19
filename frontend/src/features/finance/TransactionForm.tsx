import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { normalizeAmount, todayISO } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAccounts, useAction, useCategories } from "@/lib/queries";
import type { Transaction, TxType } from "@/lib/types";
import { Modal } from "@/components/ui/dialog";
import { Button, Field, Input, Segmented, Select } from "@/components/ui/primitives";

const LAST_ACCOUNT = "pos.lastAccount";

function rememberAccount(id: string) {
  try { localStorage.setItem(LAST_ACCOUNT, id); } catch { /* ignore */ }
}
function lastAccount(): string {
  try { return localStorage.getItem(LAST_ACCOUNT) ?? ""; } catch { return ""; }
}

export interface TxDraft { type?: TxType; account_id?: number; category_id?: number }

export function TransactionForm({ open, onOpenChange, editing, draft }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: Transaction | null; draft?: TxDraft }) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const active = accounts.filter((a) => !a.is_archived || a.id === editing?.account.id || a.id === editing?.to_account?.id);

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [payee, setPayee] = useState("");
  const [tags, setTags] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (editing) {
      setType(editing.type);
      setAmount(editing.amount);
      setDate(editing.date);
      setAccountId(String(editing.account.id));
      setToAccountId(editing.to_account ? String(editing.to_account.id) : "");
      setCategoryId(editing.category ? String(editing.category.id) : "");
      setDescription(editing.description);
      setPayee(editing.payee ?? "");
      setTags(editing.tags.join(", "));
    } else {
      setType(draft?.type ?? "expense");
      setAmount("");
      setDate(todayISO());
      const remembered = lastAccount();
      const fallback = accounts.find((a) => !a.is_archived)?.id;
      setAccountId(String(draft?.account_id ?? (accounts.some((a) => String(a.id) === remembered && !a.is_archived) ? remembered : fallback ?? "")));
      setToAccountId("");
      setCategoryId(draft?.category_id ? String(draft.category_id) : "");
      setDescription("");
      setPayee("");
      setTags("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const cats = useMemo(() => categories.filter((c) => c.kind === type && (!c.is_archived || String(c.id) === categoryId)), [categories, type, categoryId]);
  const source = accounts.find((a) => String(a.id) === accountId);
  const linkedToInstallment = !!editing?.installment_payment_id;

  const save = useAction(
    (body: Record<string, unknown>) => (editing ? api.patch(`/transactions/${editing.id}`, body) : api.post("/transactions", body)),
    { success: editing ? t("Transaction updated") : t("Transaction added"), onSuccess: () => onOpenChange(false) },
  );

  function submit() {
    const e: Record<string, string> = {};
    const amt = normalizeAmount(amount);
    if (!amt || Number(amt) <= 0) e.amount = t("Enter an amount greater than 0 with at most 2 decimals");
    if (!date) e.date = t("Pick a date");
    if (!accountId) e.account = t("Choose an account");
    if (type === "transfer") {
      if (!toAccountId) e.to_account = t("Choose the destination account");
      else if (toAccountId === accountId) e.to_account = t("Choose a different account");
      else {
        const dst = accounts.find((a) => String(a.id) === toAccountId);
        if (dst && source && dst.currency !== source.currency) e.to_account = t("Both accounts must use the same currency");
      }
    } else if (!categoryId) e.category = t("Choose a category");
    setErrors(e);
    if (Object.keys(e).length) return;
    rememberAccount(accountId);
    save.mutate({
      type,
      amount: amt,
      date,
      account_id: Number(accountId),
      to_account_id: type === "transfer" ? Number(toAccountId) : null,
      category_id: type === "transfer" ? null : Number(categoryId),
      description: description.trim(),
      payee: payee.trim() || null,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("Edit transaction") : t("New transaction")}
      description={type === "transfer" ? t("Transfers move money between your accounts and never count as income or expense.") : undefined}
      onSubmit={submit}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{editing ? t("Save") : t("Add")}</Button></>}
    >
      {accounts.length === 0 ? (
        <p className="text-sm text-ink-2">{t("Create an account first (Finances → Accounts).")}</p>
      ) : (
        <>
          <Segmented
            value={type}
            onChange={(v) => { setType(v); setCategoryId(""); }}
            options={[{ value: "expense", label: t("Expense") }, { value: "income", label: t("Income") }, { value: "transfer", label: t("Transfer") }]}
            className={linkedToInstallment ? "pointer-events-none opacity-50" : ""}
          />
          {linkedToInstallment && <p className="text-xs text-warn">{t("Recorded by an installment payment — amount, type and account are managed in Installments.")}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t("Amount")}${source ? ` (${source.currency})` : ""}`} error={errors.amount}>
              {(id) => <Input id={id} ref={amountRef} autoFocus inputMode="decimal" placeholder="0.00" value={amount} disabled={linkedToInstallment} aria-invalid={!!errors.amount} onChange={(e) => setAmount(e.target.value)} className="tnum text-base" />}
            </Field>
            <Field label={t("Date")} error={errors.date}>
              {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={type === "transfer" ? t("From account") : t("Account")} error={errors.account}>
              {(id) => (
                <Select id={id} value={accountId} disabled={linkedToInstallment} onChange={(e) => setAccountId(e.target.value)} aria-invalid={!!errors.account}>
                  <option value="">{t("Select…")}</option>
                  {active.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                </Select>
              )}
            </Field>
            {type === "transfer" ? (
              <Field label={t("To account")} error={errors.to_account}>
                {(id) => (
                  <Select id={id} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} aria-invalid={!!errors.to_account}>
                    <option value="">{t("Select…")}</option>
                    {active.filter((a) => String(a.id) !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label={t("Category")} error={errors.category}>
                {(id) => (
                  <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={!!errors.category}>
                    <option value="">{t("Select…")}</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}
                  </Select>
                )}
              </Field>
            )}
          </div>
          <Field label={t("Description")}>
            {(id) => <Input id={id} value={description} maxLength={255} placeholder={type === "transfer" ? t("e.g. Monthly savings") : t("What was it for?")} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          {type !== "transfer" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={type === "income" ? t("Payer (optional)") : t("Merchant / payee (optional)")}>
                {(id) => <Input id={id} value={payee} maxLength={120} onChange={(e) => setPayee(e.target.value)} />}
              </Field>
              <Field label={t("Tags (comma separated)")}>
                {(id) => <Input id={id} value={tags} placeholder={t("trip, gift")} onChange={(e) => setTags(e.target.value)} />}
              </Field>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
