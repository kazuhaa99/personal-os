import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type FormEvent, type ReactNode } from "react";
import { Button, cn } from "./primitives";

/** Modal used for every create/edit form. Esc closes, focus is trapped, Enter submits. */
export function Modal({ open, onOpenChange, title, description, children, footer, onSubmit, wide }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: (e: FormEvent) => void;
  wide?: boolean;
}) {
  const Body = onSubmit ? "form" : "div";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-overlay fixed inset-0 z-40 bg-black/25 backdrop-blur-[3px]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-[12vh] sm:-translate-x-1/2",
            "dlg-content w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl mat-popover",
            "max-h-[88vh] flex flex-col",
            wide && "sm:max-w-2xl",
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <Body
            className="flex flex-col min-h-0"
            {...(onSubmit ? { onSubmit: (e: FormEvent) => { e.preventDefault(); onSubmit(e); }, noValidate: true } : {})}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
                {description ? <Dialog.Description className="text-xs text-ink-3 mt-1">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button>
              </Dialog.Close>
            </div>
            <div className="px-5 pb-4 overflow-y-auto space-y-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 px-5 py-3.5 border-t hairline">{footer}</div>}
          </Body>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ------------------------------------------------------------------ confirm()

interface ConfirmOptions { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/25 backdrop-blur-[3px]" />
          <AlertDialog.Content className="dlg-content fixed z-50 left-1/2 top-[22vh] -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm rounded-2xl mat-popover p-5">
            <AlertDialog.Title className="text-base font-semibold">{state?.title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-ink-2">{state?.body ?? "This cannot be undone."}</AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild><Button>Cancel</Button></AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant={state?.danger === false ? "primary" : "danger"} onClick={() => close(true)}>{state?.confirmLabel ?? "Delete"}</Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
