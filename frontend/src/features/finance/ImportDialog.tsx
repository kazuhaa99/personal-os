import { FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { t, tp } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { ImportIssue, ImportReport } from "@/lib/types";
import { Modal } from "@/components/ui/dialog";
import { Badge, Button } from "@/components/ui/primitives";

/** Renders `backticked` spans of a translated string as <code>. */
function withCode(s: string) {
  return s.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i} className="text-ink">{part}</code> : part));
}

function IssueTable({ items, tone }: { items: ImportIssue[]; tone: "bad" | "warn" }) {
  return (
    <div className="max-h-48 overflow-auto rounded-lg border hairline">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-raised text-ink-3"><tr><th className="text-left px-2.5 py-1.5 w-12">{t("Row")}</th><th className="text-left px-2.5 py-1.5">{t("Reason")}</th><th className="text-left px-2.5 py-1.5">{t("Data")}</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.row} className="border-t hairline align-top">
              <td className="px-2.5 py-1.5 tnum text-ink-2">{i.row}</td>
              <td className={tone === "bad" ? "px-2.5 py-1.5 text-bad" : "px-2.5 py-1.5 text-warn"}>{i.reason}</td>
              <td className="px-2.5 py-1.5 text-ink-3 break-all">{Object.values(i.raw).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!open) { setFile(null); setPreview(null); setError(null); } }, [open]);

  const send = (dryRun: boolean) => {
    const fd = new FormData();
    fd.append("file", file!);
    return api.post<ImportReport>(`/transactions/import?dry_run=${dryRun}`, fd);
  };

  async function check(f: File) {
    setFile(f);
    setPreview(null);
    setError(null);
    setChecking(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      setPreview(await api.post<ImportReport>("/transactions/import?dry_run=true", fd));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  const commit = useAction(() => send(false), { refresh: ["finance"],
    success: (r) => tp("Imported {n} transaction", (r as ImportReport).imported),
    onSuccess: (r) => setPreview(r as ImportReport),
  });
  const done = preview && !preview.dry_run;

  return (
    <Modal open={open} onOpenChange={onOpenChange} wide title={t("Import transactions from CSV")}
      description={t("Step 1 checks the file without saving anything. Nothing is created implicitly: unknown accounts or categories reject the row.")}
      footer={done ? <Button variant="primary" onClick={() => onOpenChange(false)}>{t("Close")}</Button> : (
        <><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={!preview || preview.imported === 0} loading={commit.isPending} onClick={() => commit.mutate(undefined)}>
            {tp("Import {n} row", preview?.imported ?? 0)}
          </Button></>
      )}>
      <div className="rounded-lg bg-fill/[0.04] border hairline p-3 text-xs text-ink-2 leading-relaxed">
        {withCode(t("Header row required. Columns: `date, type, amount, account, to_account, category, description, payee, tags, currency`. Required: `date, amount, account`. Dates as YYYY-MM-DD or DD.MM.YYYY. If `type` is empty, a negative amount is an expense and a positive one income. Tags separated by `|`. Exports from this app re-import as-is."))}
      </div>
      {!done && (
        <label className="flex items-center gap-3 rounded-lg border border-dashed border-line/20 px-4 py-5 cursor-pointer hover:bg-fill/[0.03]">
          <FileUp className="h-5 w-5 text-ink-3" />
          <span className="text-sm text-ink-2">{file ? file.name : t("Choose a .csv file (max 5 MB)")}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && check(e.target.files[0])} />
        </label>
      )}
      {checking && <p className="text-sm text-ink-3">{t("Checking…")}</p>}
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="neutral">{tp("{n} row", preview.total_rows)}</Badge>
            <Badge tone="good">{preview.dry_run ? t("{n} ready to import", { n: preview.imported }) : t("{n} imported", { n: preview.imported })}</Badge>
            <Badge tone="bad">{t("{n} rejected", { n: preview.rejected.length })}</Badge>
            <Badge tone="warn">{tp("{n} duplicate skipped", preview.duplicates.length)}</Badge>
          </div>
          {preview.rejected.length > 0 && <><p className="text-xs font-medium text-ink-2">{t("Rejected rows (fix and re-import)")}</p><IssueTable items={preview.rejected} tone="bad" /></>}
          {preview.duplicates.length > 0 && <><p className="text-xs font-medium text-ink-2">{t("Duplicates (already recorded, will not be imported)")}</p><IssueTable items={preview.duplicates} tone="warn" /></>}
        </div>
      )}
    </Modal>
  );
}
