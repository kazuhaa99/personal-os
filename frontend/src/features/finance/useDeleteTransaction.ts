import { useConfirm } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { fmtDate, formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Transaction } from "@/lib/types";

/** Delete a transaction after confirming; shared by the list and the edit dialog. */
export function useDeleteTransaction(onDeleted?: () => void) {
  const confirm = useConfirm();
  const del = useAction((id: number) => api.del(`/transactions/${id}`), { refresh: ["finance"], success: t("Transaction deleted"), onSuccess: () => onDeleted?.() });
  return async (tx: Transaction) => {
    const what = tx.description || (tx.category ? t(tx.category.name) : t("transfer"));
    if (await confirm({ title: t("Delete transaction?"), body: t("{amount} · {what} on {date}. Account balances will be recalculated.", { amount: formatMoney(tx.amount, tx.currency), what, date: fmtDate(tx.date) }) })) del.mutate(tx.id);
  };
}
