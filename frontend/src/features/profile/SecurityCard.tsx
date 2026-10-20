import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { AuthUser, Profile } from "@/lib/types";
import { useAuth } from "@/features/auth/AuthGate";
import { Modal } from "@/components/ui/dialog";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { PROFILE_KEY, securityError } from "./shared";

const RESEND_SECONDS = 60;

/** Account mutation: updates the signed-in user everywhere and refreshes the profile. */
function useAccountAction<V>(fn: (v: V) => Promise<AuthUser>, onDone?: (u: AuthUser) => void) {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (u) => {
      setUser(u);
      qc.setQueryData<Profile>(PROFILE_KEY, (p) => (p ? { ...p, account: u } : p));
      qc.invalidateQueries({ queryKey: PROFILE_KEY });
      onDone?.(u);
    },
  });
}

function useCountdown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [until, now]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return { left, start: () => { const n = Date.now(); setNow(n); setUntil(n + RESEND_SECONDS * 1000); } };
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-t hairline first:border-t-0">
      <span className="mt-0.5 text-ink-3 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-3">{label}</p>
        <div className="mt-0.5 text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ email

function EmailChange({ account }: { account: AuthUser }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timer = useCountdown();
  const pending = account.pending_email;

  const start = useAccountAction((b: { email: string; password: string }) => api.post<AuthUser>("/auth/email/change", b), () => {
    timer.start(); setPassword(""); setCode(""); setError(null); setEditing(false);
    toast.success(t("We sent a code to the new address"));
  });
  const resend = useAccountAction(() => api.post<AuthUser>("/auth/email/resend"), () => { timer.start(); setError(null); toast.success(t("A new code is on its way")); });
  const confirmCode = useAccountAction((c: string) => api.post<AuthUser>("/auth/email/confirm", { code: c }), () => {
    setCode(""); setError(null); toast.success(t("Email changed"));
  });
  const cancel = useAccountAction(() => api.del<AuthUser>("/auth/email/change"), () => { setCode(""); setError(null); toast.success(t("Email change cancelled")); });
  const fail = (e: unknown) => setError(securityError(e));

  if (pending) {
    return (
      <motion.form key="code" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl bg-fill/[0.04] p-3.5 space-y-3" noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{6}$/.test(code)) { setError(t("Enter the 6-digit code")); return; }
          confirmCode.mutate(code, { onError: fail });
        }}>
        <p className="text-sm text-ink-2">
          {t("Enter the code we sent to")} <b className="font-medium text-ink break-all">{pending}</b>
        </p>
        <Field label={t("Confirmation code")} error={error}>{(id) => (
          <Input id={id} autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d*" maxLength={6} placeholder="••••••"
            className="h-11 max-w-[200px] text-center text-lg tracking-[0.4em] tnum" aria-invalid={!!error}
            value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }} />
        )}</Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={confirmCode.isPending} disabled={code.length !== 6}>{t("Confirm")}</Button>
          <Button variant="ghost" disabled={timer.left > 0} loading={resend.isPending} onClick={() => resend.mutate(undefined, { onError: fail })}>
            {timer.left > 0 ? t("Resend in {s} s", { s: timer.left }) : t("Resend code")}
          </Button>
          <Button variant="ghost" className="text-bad hover:text-bad" loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: fail })}>{t("Cancel change")}</Button>
        </div>
      </motion.form>
    );
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      {editing ? (
        <motion.form key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = email.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setError(t("Enter a valid email address")); return; }
            if (!password) { setError(t("Enter your current password")); return; }
            start.mutate({ email: v, password }, { onError: fail });
          }}>
          <div className="mt-3 rounded-xl bg-fill/[0.04] p-3.5 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("New email")}>{(id) => <Input id={id} autoFocus type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} />}</Field>
              <Field label={t("Current password")}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} />}</Field>
            </div>
            {error && <p className="text-xs text-bad" role="alert">{error}</p>}
            <p className="text-2xs text-ink-3">{t("We'll send a 6-digit code to the new address. Your current email stays until you confirm.")}</p>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={start.isPending}>{t("Send code")}</Button>
              <Button onClick={() => { setEditing(false); setError(null); setPassword(""); }}>{t("Cancel")}</Button>
            </div>
          </div>
        </motion.form>
      ) : (
        <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2">
          <Button size="sm" onClick={() => { setEditing(true); setEmail(""); setError(null); }}>
            {account.email ? t("Change email") : t("Add email")}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ password

function PasswordModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { setUser } = useAuth();
  const [f, setF] = useState({ current: "", next: "", repeat: "" });
  const [errors, setErrors] = useState<{ current?: string; next?: string; repeat?: string }>({});
  useEffect(() => { if (open) { setF({ current: "", next: "", repeat: "" }); setErrors({}); } }, [open]);
  const change = useMutation({
    mutationFn: (b: { current_password: string; new_password: string }) => api.post<{ user: AuthUser }>("/auth/password/change", b),
    onSuccess: (r) => { if (r?.user) setUser(r.user); toast.success(t("Password changed. Other devices were signed out.")); onOpenChange(false); },
    onError: (e) => setErrors({ current: securityError(e) }),
  });

  function submit() {
    const e: typeof errors = {};
    if (!f.current) e.current = t("Enter your current password");
    if (f.next.length < 8) e.next = t("At least 8 characters");
    else if (f.next !== f.repeat) e.repeat = t("Passwords don't match");
    setErrors(e);
    if (!Object.keys(e).length) change.mutate({ current_password: f.current, new_password: f.next });
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF((s) => ({ ...s, [k]: e.target.value })); setErrors((s) => ({ ...s, [k]: undefined })); };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("Change password")} onSubmit={submit}
      description={t("You'll stay signed in here; other devices will be signed out.")}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={change.isPending}>{t("Change password")}</Button></>}>
      <Field label={t("Current password")} error={errors.current}>{(id) => <Input id={id} autoFocus type="password" autoComplete="current-password" value={f.current} aria-invalid={!!errors.current} onChange={set("current")} />}</Field>
      <Field label={t("New password")} error={errors.next} hint={t("At least 8 characters")}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.next} aria-invalid={!!errors.next} onChange={set("next")} />}</Field>
      <Field label={t("Repeat new password")} error={errors.repeat}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.repeat} aria-invalid={!!errors.repeat} onChange={set("repeat")} />}</Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ card

export function SecurityCard({ account }: { account: AuthUser }) {
  const [pwOpen, setPwOpen] = useState(false);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ink-3" /> {t("Login & security")}</span>} />
      <div className="px-5 pb-4">
        <Row icon={<AtSign className="h-4 w-4" />} label={t("Login")}>
          <span className="font-medium">{account.username}</span>
          <p className="text-2xs text-ink-3 mt-0.5">{t("The login can't be changed.")}</p>
        </Row>
        <Row icon={<Mail className="h-4 w-4" />} label={t("Email")}>
          <div className="flex flex-wrap items-center gap-2">
            {account.email ? <span className="break-all">{account.email}</span> : <span className="text-ink-3">{t("No email")}</span>}
            {account.email && <Badge tone={account.email_verified ? "good" : "warn"}>{account.email_verified ? t("Confirmed") : t("Not confirmed")}</Badge>}
            {account.pending_email && <Badge tone="accent">{t("Change pending")}</Badge>}
          </div>
          <EmailChange account={account} />
        </Row>
        <Row icon={<KeyRound className="h-4 w-4" />} label={t("Password")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="tracking-[0.2em] text-ink-2">••••••••</span>
            <Button size="sm" onClick={() => setPwOpen(true)}>{t("Change password")}</Button>
          </div>
        </Row>
      </div>
      <PasswordModal open={pwOpen} onOpenChange={setPwOpen} />
    </Card>
  );
}
