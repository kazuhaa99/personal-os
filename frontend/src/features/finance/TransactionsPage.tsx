import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { ArrowLeftRight, Download, Pencil, Receipt, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/lib/api";
import { fmtDate, formatMoney, todayISO } from "@/lib/format";
import { useAccounts, useAction, useCategories } from "@/lib/queries";
import type { Transaction, TxPage } from "@/lib/types";
import { useConfirm } from "@/components/ui/dialog";
import { Badge, Button, Card, cn, DemoBadge, EmptyState, ErrorBlock, Input, LoadingBlock, Select } from "@/components/ui/primitives";
import { useQuickActions } from "@/components/layout/QuickActions";
import { toast } from "sonner";
import { ImportDialog } from "./ImportDialog";

const PAGE = 50;
const ISO = "yyyy-MM-dd";

const PRESETS: { key: string; label: string; range: () => [string, string] | null }[] = [
  { key: "month", label: "This month", range: () => [format(startOfMonth(new Date()), ISO), format(endOfMonth(new Date()), ISO)] },
  { key: "last-month", label: "Last month", range: () => { const d = subMonths(new Date(), 1); return [format(startOfMonth(d), ISO), format(endOfMonth(d), ISO)]; } },
  { key: "30d", label: "Last 30 days", range: () => [format(subDays(new Date(), 29), ISO), todayISO()] },
  { key: "90d", label: "Last 90 days", range: () => [format(subDays(new Date(), 89), ISO), todayISO()] },
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
  const confirm = useConfirm();
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const filter = {
    start: params.get("start") ?? "",
    end: params.get("end") ?? "",
    account_id: params.get("account_id") ?? "",
    type: params.get("type") ?? "",
    category_id: params.get("category_id") ?? "",
    q: params.get("q") ?? "",
  };
  const offset = Number(params.get("offset") ?? 0);
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

  const del = useAction((id: number) => api.del(`/transactions/${id}`), { success: "Transaction deleted" });

  async function onDelete(tx: Transaction) {
    if (await confirm({ title: "Delete transaction?", body: `${formatMoney(tx.amount, tx.currency)} · ${tx.description || tx.category?.name || "transfer"} on ${fmtDate(tx.date)}. Account balances will be recalculated.` })) del.mutate(tx.id);
  }

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
        <Select aria-label="Date range" className="w-auto" value={activePreset} onChange={(e) => {
          const p = PRESETS.find((x) => x.key === e.target.value);
          if (!p) return;
          const r = p.range();
          set({ start: r?.[0] ?? "", end: r?.[1] ?? "" });
        }}>
          {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          <option value="custom" disabled>Custom range</option>
        </Select>
        <Input type="date" aria-label="From date" className="w-[9.5rem]" value={filter.start} onChange={(e) => set({ start: e.target.value })} />
        <span className="text-ink-3 text-sm">–</span>
        <Input type="date" aria-label="To date" className="w-[9.5rem]" value={filter.end} onChange={(e) => set({ end: e.target.value })} />
        <Select aria-label="Account" className="w-auto max-w-[12rem]" value={filter.account_id} onChange={(e) => set({ account_id: e.target.value })}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_archived ? " (archived)" : ""}</option>)}
        </Select>
        <Select aria-label="Type" className="w-auto" value={filter.type} onChange={(e) => set({ type: e.target.value, category_id: "" })}>
          <option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option>
        </Select>
        {filter.type !== "transfer" && (
          <Select aria-label="Category" className="w-auto max-w-[13rem]" value={filter.category_id} onChange={(e) => set({ category_id: e.target.value })}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{!filter.type ? ` (${c.kind})` : ""}</option>)}
          </Select>
        )}
        <form className="relative flex-1 min-w-[10rem]" onSubmit={(e) => { e.preventDefault(); set({ q: search.trim() }); }}>
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
          <Input aria-label="Search" placeholder="Search description, payee, amount…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search.trim() !== filter.q && set({ q: search.trim() })} />
        </form>
        <div className="flex gap-2 ml-auto">
          <Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import</Button>
          <Button onClick={onExport}><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {data && data.totals.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm px-1">
          {data.totals.map((t) => (
            <div key={t.currency} className="flex flex-wrap gap-x-5 gap-y-1">
              <span className="text-ink-3">Income <span className="tnum text-good ml-1">{formatMoney(t.income, t.currency)}</span></span>
              <span className="text-ink-3">Expenses <span className="tnum text-ink ml-1">{formatMoney(t.expense, t.currency)}</span></span>
              <span className="text-ink-3">Net <span className={cn("tnum ml-1", t.net.startsWith("-") ? "text-bad" : "text-good")}>{formatMoney(t.net, t.currency, { sign: true })}</span></span>
              <span className="text-ink-3">Transfers <span className="tnum text-ink-2 ml-1">{formatMoney(t.transfers, t.currency)}</span> <span className="text-2xs">(excluded from net)</span></span>
            </div>
          ))}
        </div>
      )}

      <Card className={cn("overflow-hidden transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : !data?.items.length ? (
          <EmptyState icon={<Receipt className="h-6 w-6" />} title={data?.total === 0 && !Object.values(filter).some(Boolean) ? "No transactions yet" : "No transactions match these filters"}
            body="Record income, expenses and transfers as they happen, or import a CSV."
            action={<Button variant="primary" onClick={() => qa.newTransaction()}>Add transaction</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-3 border-b hairline">
                  <th className="text-left font-normal px-4 py-2.5 w-28">Date</th>
                  <th className="text-left font-normal px-4 py-2.5">Description</th>
                  <th className="text-left font-normal px-4 py-2.5 hidden md:table-cell">Category</th>
                  <th className="text-left font-normal px-4 py-2.5 hidden sm:table-cell">Account</th>
                  <th className="text-right font-normal px-4 py-2.5">Amount</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((tx) => (
                  <tr key={tx.id} className="group border-b hairline last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-ink-2 tnum whitespace-nowrap">{fmtDate(tx.date, "d MMM yy")}</td>
                    <td className="px-4 py-2.5 max-w-[22rem]">
                      <p className="truncate">{tx.description || tx.payee || (tx.type === "transfer" ? "Transfer" : tx.category?.name)}<DemoBadge show={tx.is_demo} /></p>
                      <p className="text-xs text-ink-3 truncate">
                        {tx.payee && tx.description ? tx.payee : ""}
                        {tx.tags.map((t) => <span key={t} className="mr-1.5">#{t}</span>)}
                        {tx.recurring_rule_id && <Badge className="mr-1">recurring</Badge>}
                        {tx.installment_payment_id && <Badge className="mr-1">installment</Badge>}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      {tx.type === "transfer" ? <span className="inline-flex items-center gap-1 text-ink-3 text-xs"><ArrowLeftRight className="h-3.5 w-3.5" /> Transfer</span> : (
                        <span className="inline-flex items-center gap-1.5 text-ink-2 whitespace-nowrap"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tx.category?.color }} />{tx.category?.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-ink-2 whitespace-nowrap">{tx.account.name}{tx.to_account && <span className="text-ink-3"> → {tx.to_account.name}</span>}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap"><Amount tx={tx} /></td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label="Edit" className="h-7 w-7 opacity-60 group-hover:opacity-100" onClick={() => qa.editTransaction(tx)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Delete" className="h-7 w-7 opacity-60 group-hover:opacity-100" onClick={() => onDelete(tx)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <span className="tnum">{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={offset === 0} onClick={() => set({ offset: String(Math.max(0, offset - PAGE)) })}>Previous</Button>
            <Button size="sm" disabled={offset + PAGE >= data.total} onClick={() => set({ offset: String(offset + PAGE) })}>Next</Button>
          </div>
        </div>
      )}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
