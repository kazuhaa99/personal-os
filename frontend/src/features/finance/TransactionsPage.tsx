import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { ArrowLeftRight, Download, Pencil, Receipt, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/lib/api";
import { fmtDate, formatMoney, todayISO, nowInAppZone } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAccounts, useCategories } from "@/lib/queries";
import type { Transaction, TxPage } from "@/lib/types";
import { Badge, Button, Card, cn, DemoBadge, EmptyState, ErrorBlock, Input, LoadingBlock, Select } from "@/components/ui/primitives";
import { useQuickActions } from "@/components/layout/QuickActions";
import { toast } from "sonner";
import { ImportDialog } from "./ImportDialog";
import { dateParam, idParam, offsetParam, oneOf } from "@/lib/urlParams";
import { useDeleteTransaction } from "./useDeleteTransaction";

const TX_TYPES = ["", "income", "expense", "transfer"] as const;

const PAGE = 50;
const ISO = "yyyy-MM-dd";

const PRESETS: { key: string; label: string; range: () => [string, string] | null }[] = [
  { key: "month", label: "This month", range: () => [format(startOfMonth(nowInAppZone()), ISO), format(endOfMonth(nowInAppZone()), ISO)] },
  { key: "last-month", label: "Last month", range: () => { const d = subMonths(nowInAppZone(), 1); return [format(startOfMonth(d), ISO), format(endOfMonth(d), ISO)]; } },
  { key: "30d", label: "Last 30 days", range: () => [format(subDays(nowInAppZone(), 29), ISO), todayISO()] },
  { key: "90d", label: "Last 90 days", range: () => [format(subDays(nowInAppZone(), 89), ISO), todayISO()] },
  { key: "all", label: "All time", range: () => null },
];

function Amount({ tx }: { tx: Transaction }) {
  if (tx.type === "transfer") return <span className="tnum text-ink-2">{formatMoney(tx.amount, tx.currency)}</span>;
  return <span className={cn("tnum", tx.type === "income" ? "text-good" : "text-ink")}>{formatMoney(tx.type === "expense" ? `-${tx.amount}` : tx.amount, tx.currency, { sign: true })}</span>;
}

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const qa = useQuickActions();
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const filter = {
    start: dateParam(params.get("start")),
    end: dateParam(params.get("end")),
    account_id: idParam(params.get("account_id")),
    type: oneOf(params.get("type"), TX_TYPES, ""),
    category_id: idParam(params.get("category_id")),
    q: params.get("q") ?? "",
  };
  const offset = offsetParam(params.get("offset"));
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("offset" in patch)) next.delete("offset");
    setParams(next, { replace: true });
  };
  const activePreset = useMemo(() => PRESETS.find((p) => {
    const r = p.range();
    return r ? r[0] === filter.start && r[1] === filter.end : !filter.start && !filter.end;
  })?.key ?? "custom", [filter.start, filter.end]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["transactions", filter, offset],
    queryFn: () => api.get<TxPage>("/transactions", { ...filter, limit: PAGE, offset }),
  });

  const onDelete = useDeleteTransaction();

  async function onExport() {
    try {
      await api.download("/transactions/export.csv", filter, `transactions-${todayISO()}.csv`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const cats = categories.filter((c) => !filter.type || c.kind === filter.type);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={t("Date range")} className="w-auto" value={activePreset} onChange={(e) => {
          const p = PRESETS.find((x) => x.key === e.target.value);
          if (!p) return;
          const r = p.range();
          set({ start: r?.[0] ?? "", end: r?.[1] ?? "" });
        }}>
          {PRESETS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}
          <option value="custom" disabled>{t("Custom range")}</option>
        </Select>
        {/* Visible captions: the date field's own placeholder follows the device's language, not the app's. */}
        <label className="flex items-center gap-1.5 text-xs text-ink-2 max-sm:flex-1">{t("From")}
          <Input type="date" aria-label={t("From date")} className="w-full sm:w-[9.5rem]" value={filter.start} onChange={(e) => set({ start: e.target.value })} /></label>
        <label className="flex items-center gap-1.5 text-xs text-ink-2 max-sm:flex-1">{t("To")}
          <Input type="date" aria-label={t("To date")} className="w-full sm:w-[9.5rem]" value={filter.end} onChange={(e) => set({ end: e.target.value })} /></label>
        <Select aria-label={t("Account")} className="w-auto max-w-[12rem]" value={filter.account_id} onChange={(e) => set({ account_id: e.target.value })}>
          <option value="">{t("All accounts")}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_archived ? ` (${t("archived")})` : ""}</option>)}
        </Select>
        <Select aria-label={t("Type")} className="w-auto" value={filter.type} onChange={(e) => set({ type: e.target.value, category_id: "" })}>
          <option value="">{t("All types")}</option><option value="expense">{t("Expenses")}</option><option value="income">{t("Income")}</option><option value="transfer">{t("Transfers")}</option>
        </Select>
        {filter.type !== "transfer" && (
          <Select aria-label={t("Category")} className="w-auto max-w-[13rem]" value={filter.category_id} onChange={(e) => set({ category_id: e.target.value })}>
            <option value="">{t("All categories")}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{t(c.name)}{!filter.type ? ` (${c.kind === "income" ? t("income") : t("expense")})` : ""}</option>)}
          </Select>
        )}
        <form className="relative flex-1 min-w-[10rem]" onSubmit={(e) => { e.preventDefault(); set({ q: search.trim() }); }}>
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
          <Input aria-label={t("Search")} placeholder={t("Search description, payee, amount…")} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search.trim() !== filter.q && set({ q: search.trim() })} />
        </form>
        <div className="flex gap-2 ml-auto">
          <Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> {t("Import")}</Button>
          <Button onClick={onExport}><Download className="h-4 w-4" /> {t("Export")}</Button>
        </div>
      </div>

      {data && data.totals.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm px-1">
          {data.totals.map((tot) => (
            <div key={tot.currency} className="flex flex-wrap gap-x-5 gap-y-1">
              <span className="text-ink-3">{t("Income")} <span className="tnum text-good ml-1">{formatMoney(tot.income, tot.currency)}</span></span>
              <span className="text-ink-3">{t("Expenses")} <span className="tnum text-ink ml-1">{formatMoney(tot.expense, tot.currency)}</span></span>
              <span className="text-ink-3">{t("Net")} <span className={cn("tnum ml-1", tot.net.startsWith("-") ? "text-bad" : "text-good")}>{formatMoney(tot.net, tot.currency, { sign: true })}</span></span>
              <span className="text-ink-3">{t("Transfers")} <span className="tnum text-ink-2 ml-1">{formatMoney(tot.transfers, tot.currency)}</span> <span className="text-2xs">{t("(excluded from net)")}</span></span>
            </div>
          ))}
        </div>
      )}

      <Card className={cn("overflow-hidden transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : !data?.items.length ? (
          <EmptyState icon={<Receipt className="h-6 w-6" />} title={data?.total === 0 && !Object.values(filter).some(Boolean) ? t("No transactions yet") : t("No transactions match these filters")}
            body={t("Record income, expenses and transfers as they happen, or import a CSV.")}
            action={<Button variant="primary" onClick={() => qa.newTransaction()}>{t("Add transaction")}</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-3 border-b hairline">
                  <th className="text-left font-normal px-3 py-2 w-28">{t("Date")}</th>
                  <th className="text-left font-normal px-3 py-2">{t("Description")}</th>
                  <th className="text-left font-normal px-3 py-2 hidden md:table-cell">{t("Category")}</th>
                  <th className="text-left font-normal px-3 py-2 hidden sm:table-cell">{t("Account")}</th>
                  <th className="text-right font-normal px-3 py-2">{t("Amount")}</th>
                  {/* Phones: edit and delete open from the row (the dialog has Delete), keeping the amount on screen. */}
                  <th className="w-16 hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((tx) => (
                  <tr key={tx.id} className="group border-b hairline last:border-0 hover:bg-fill/[0.02]">
                    <td className="px-3 py-2 text-ink-2 tnum whitespace-nowrap">{fmtDate(tx.date, "d MMM yy")}</td>
                    <td className="px-3 py-2 max-w-[38vw] sm:max-w-[22rem]">
                      {/* The description opens the transaction: a large target, also on a phone. */}
                      <button type="button" className="block max-w-full text-left coarse:min-h-11" onClick={() => qa.editTransaction(tx)}>
                      <p className="truncate">{tx.description || tx.payee || (tx.type === "transfer" ? t("Transfer") : tx.category ? t(tx.category.name) : "")}<DemoBadge show={tx.is_demo} dot /></p>
                      <p className="text-xs text-ink-3 truncate">
                        {tx.payee && tx.description ? tx.payee : ""}
                        {tx.tags.map((tag) => <span key={tag} className="mr-1.5">#{tag}</span>)}
                        {tx.recurring_rule_id && <Badge className="mr-1">{t("recurring")}</Badge>}
                        {tx.installment_payment_id && <Badge className="mr-1">{t("installment")}</Badge>}
                      </p>
                      </button>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      {tx.type === "transfer" ? <span className="inline-flex items-center gap-1 text-ink-3 text-xs"><ArrowLeftRight className="h-3.5 w-3.5" /> {t("Transfer")}</span> : (
                        <span className="inline-flex items-center gap-1.5 text-ink-2 whitespace-nowrap"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tx.category?.color }} />{tx.category ? t(tx.category.name) : ""}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell text-ink-2 whitespace-nowrap">{tx.account.name}{tx.to_account && <span className="text-ink-3"> → {tx.to_account.name}</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><Amount tx={tx} /></td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap hidden sm:table-cell">
                      <Button variant="ghost" size="icon" aria-label={t("Edit")} className="coarse:hidden" onClick={() => qa.editTransaction(tx)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" aria-label={t("Delete")} onClick={() => onDelete(tx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && data.total > PAGE && (
        <div className="flex items-center justify-between text-xs text-ink-3">
          <span className="tnum">{t("{from}–{to} of {total}", { from: offset + 1, to: Math.min(offset + PAGE, data.total), total: data.total })}</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={offset === 0} onClick={() => set({ offset: String(Math.max(0, offset - PAGE)) })}>{t("Previous")}</Button>
            <Button size="sm" disabled={offset + PAGE >= data.total} onClick={() => set({ offset: String(offset + PAGE) })}>{t("Next")}</Button>
          </div>
        </div>
      )}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
