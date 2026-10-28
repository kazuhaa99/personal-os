import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { ArrowLeft, ArrowRight, AtSign, Eye, EyeOff, KeyRound, Lock, Mail, User } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { signIn } from "@/lib/nativeSession";
import { IS_NATIVE } from "@/platform";
import { format, LANGUAGES, t, useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { AuthUser } from "@/lib/types";
import { useSheen } from "@/lib/useSheen";
import { Button, cn } from "@/components/ui/primitives";

type View =
  | { name: "login" }
  | { name: "register" }
  | { name: "verify"; identifier: string; email: string }
  | { name: "forgot" }
  | { name: "reset"; identifier: string };

/** Web: the session cookie. Native apps: bearer tokens kept in the keychain (lib/nativeSession). */
async function passwordSignIn(identifier: string, password: string): Promise<AuthUser> {
  if (IS_NATIVE) return signIn(identifier, password);
  return (await api.post<{ user: AuthUser }>("/auth/login", { identifier, password })).user;
}

/** Confirming an email or resetting a password signs the web in by cookie; native apps get their tokens too. */
const afterCodeSignIn = (user: AuthUser, identifier: string, password: string): Promise<AuthUser> =>
  IS_NATIVE ? signIn(identifier, password) : Promise.resolve(user);

/** Server error codes → translated messages (fallback: the server's English message). */
function explain(err: unknown): string {
  if (err instanceof ApiError) {
    const byCode: Record<string, string> = {
      username_taken: t("This username is taken"),
      email_taken: t("An account with this email already exists"),
      username_format: t("Username: 3–32 characters, latin letters, digits, “_” or “.”"),
      email_format: t("Enter a valid email address"),
      password_short: t("Password must be at least 8 characters"),
      code_wrong: t("Wrong code"),
      code_expired: t("The code has expired. Request a new one."),
      mail_unavailable: t("Email sending isn't set up on the server yet"),
    };
    if (err.code && byCode[err.code]) return byCode[err.code];
    if (err.status === 401) return t("Wrong username or password");
    if (err.status === 429) return t("Too many attempts. Try again in a few minutes.");
  }
  return errorMessage(err);
}

function Backdrop() {
  const { active, resolved } = useTheme();
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden style={{ background: active.color }}>
      {active.src ? (
        <motion.img src={active.src} alt="" className="absolute inset-0 h-full w-full object-cover"
          initial={{ scale: 1.12, opacity: 0 }} animate={{ scale: 1.04, opacity: 1 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }} />
      ) : (
        <div className="absolute inset-0" style={{ background: resolved === "dark" ? "radial-gradient(120% 90% at 20% 0%, #1b2a44, #0a0a0e 60%)" : "radial-gradient(120% 90% at 20% 0%, #dfe8f6, #e9e7ef 60%)" }} />
      )}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.35))" }} />
    </div>
  );
}

function Clock({ compact }: { compact: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 10_000); return () => clearInterval(id); }, []);
  return (
    // A frosted plate behind the clock, as on a lock screen: white text stays readable on any photo.
    <motion.div layout className="rounded-[28px] bg-black/60 px-7 py-3 text-center text-white backdrop-blur-md select-none">
      <p className="text-[15px] font-medium opacity-90 first-letter:uppercase">{format(now, t("EEEE, d MMMM"))}</p>
      <motion.p layout className={cn("font-display leading-none font-semibold tracking-tight tnum mt-1", compact ? "text-[56px]" : "text-[76px] sm:text-[96px]")}>{format(now, "HH:mm")}</motion.p>
    </motion.div>
  );
}

const fieldWrap = "field flex items-center gap-2.5 h-11 rounded-xl px-3.5"; // .field shows the focus ring
const inputCls = "min-w-0 flex-1 bg-transparent text-[15px] outline-none focus-visible:outline-none placeholder:text-ink-3";

function TextField({ icon, label, ...rest }: { icon: ReactNode; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={fieldWrap}>
      <span className="shrink-0 text-ink-3">{icon}</span>
      <input placeholder={label} aria-label={label} className={inputCls} spellCheck={false} {...rest} />
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className={fieldWrap}>
      <Lock className="h-4 w-4 shrink-0 text-ink-3" />
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus}
        placeholder={label} aria-label={label} className={inputCls} />
      <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-3 hover:text-ink-2" aria-label={show ? t("Hide password") : t("Show password")}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Strength({ password }: { password: string }) {
  if (!password) return null;
  const score = Math.min(4, (password.length >= 8 ? 1 : 0) + (password.length >= 12 ? 1 : 0) + (/[A-Z]/.test(password) && /[a-z]/.test(password) ? 1 : 0) + (/\d/.test(password) && /[^A-Za-z0-9]/.test(password) ? 1 : 0));
  const labels = [t("Too short"), t("Weak"), t("Okay"), t("Good"), t("Strong")];
  const colors = ["bg-bad", "bg-bad", "bg-warn", "bg-good", "bg-good"];
  return (
    <div className="flex items-center gap-2 px-1" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < Math.max(1, score) ? colors[score] : "bg-fill/[0.1]")} />)}
      </div>
      <span className="text-[11px] text-ink-3 w-16 text-right">{password.length < 8 ? labels[0] : labels[score]}</span>
    </div>
  );
}

/** Six boxes for a one-time code; supports paste and the OS "one-time-code" autofill. */
function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => refs.current[0]?.focus(), []);
  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    refs.current[Math.min(clean.length, 5)]?.focus();
    if (clean.length === 6) onComplete(clean);
  };
  return (
    <div className="flex justify-center gap-2" role="group" aria-label={t("Confirmation code")}>
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={value[i] ?? ""} disabled={disabled}
          inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={t("Digit {n}", { n: i + 1 })}
          maxLength={i === 0 ? 6 : 1}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) return set(v); // paste / autofill into a box
            set(value.slice(0, i) + v + value.slice(i + 1));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) { e.preventDefault(); onChange(value.slice(0, i - 1)); refs.current[i - 1]?.focus(); }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => { e.preventDefault(); set(e.clipboardData.getData("text")); }}
          className="field h-12 w-11 rounded-xl text-center text-xl font-semibold tnum" />
      ))}
    </div>
  );
}

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(seconds)] as const;
}

function Header({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle: ReactNode }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      {icon ?? <div className="h-14 w-14 rounded-[16px] grid place-items-center text-accent-ink text-2xl font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_18px_rgb(var(--accent)/0.4)]" style={{ background: "linear-gradient(145deg, color-mix(in srgb, rgb(var(--accent)) 70%, white), rgb(var(--accent)))" }}>P</div>}
      <h1 className="mt-4 text-[22px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-ink-2 text-balance">{subtitle}</p>
    </div>
  );
}

const linkBtn = "text-[13px] font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink";

export function LoginPage({ onSignedIn, registrationOpen }: { onSignedIn: (user: AuthUser) => void; registrationOpen: boolean }) {
  const { lang, setLang } = useLang();
  const sheen = useSheen<HTMLDivElement>();
  const shake = useAnimationControls();
  const [view, setView] = useState<View>({ name: "login" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // form state shared across views so going back keeps what was typed
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, restartResend] = useCountdown(60);

  const go = (v: View) => { setError(null); setNotice(null); setCode(""); setView(v); if (v.name === "verify" || v.name === "reset") restartResend(); };
  const fail = (err: unknown) => { setError(explain(err)); shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } }); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const submitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return fail(new Error(t("Enter your username or email and password")));
    run(async () => {
      try {
        onSignedIn(await passwordSignIn(identifier.trim(), password));
      } catch (err) {
        if (err instanceof ApiError && err.code === "email_unverified") {
          const details = err.details as { email?: string; code_sent?: boolean } | undefined;
          const addr = details?.email ?? "";
          go({ name: "verify", identifier: identifier.trim(), email: addr });
          setNotice(details?.code_sent === false
            ? t("Confirm your email to sign in. We couldn't send a code right now, try again in a few minutes.")
            : t("Confirm your email to sign in. We sent a code to {email}.", { email: addr }));
          return;
        }
        setPassword("");
        throw err;
      }
    });
  };

  const submitRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return fail(new Error(t("Password must be at least 8 characters")));
    run(async () => {
      const r = await api.post<{ email: string; username: string }>("/auth/register", { username: username.trim(), email: email.trim(), password });
      go({ name: "verify", identifier: r.username, email: r.email });
    });
  };

  const submitCode = (value = code) => {
    if (view.name !== "verify" || value.length !== 6) return;
    run(async () => {
      try {
        const r = await api.post<{ user: AuthUser }>("/auth/verify-email", { identifier: view.identifier, code: value });
        onSignedIn(await afterCodeSignIn(r.user, view.identifier, password));
      } catch (err) { setCode(""); throw err; }
    });
  };

  const resend = () => run(async () => {
    if (view.name === "verify") await api.post("/auth/resend-code", { identifier: view.identifier });
    if (view.name === "reset") await api.post("/auth/password/forgot", { identifier: view.identifier });
    restartResend();
    setNotice(t("We sent a new code."));
  });

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return fail(new Error(t("Enter your username or email")));
    run(async () => {
      await api.post("/auth/password/forgot", { identifier: identifier.trim() });
      go({ name: "reset", identifier: identifier.trim() });
      setNotice(t("If an account with a confirmed email exists, we sent a code to it."));
    });
  };

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (view.name !== "reset") return;
    if (code.length !== 6) return fail(new Error(t("Enter the 6-digit code")));
    if (password.length < 8) return fail(new Error(t("Password must be at least 8 characters")));
    run(async () => {
      const r = await api.post<{ user: AuthUser }>("/auth/password/reset", { identifier: view.identifier, code, password });
      onSignedIn(await afterCodeSignIn(r.user, view.identifier, password));
    });
  };

  const footer = view.name === "login"
    ? registrationOpen && <p className="text-[13px] text-white">{t("No account yet?")} <button className="font-semibold text-white underline-offset-2 hover:underline" onClick={() => { setPassword(""); go({ name: "register" }); }}>{t("Create one")}</button></p>
    : <button className="inline-flex items-center gap-1 text-[13px] font-medium text-white" onClick={() => { setPassword(""); go({ name: "login" }); }}><ArrowLeft className="h-3.5 w-3.5" /> {t("Back to sign in")}</button>;

  return (
    <div className="fixed inset-0 overflow-y-auto">
      <Backdrop />
      <div className="min-h-full flex flex-col items-center justify-center gap-8 pl-[max(1rem,var(--sal))] pr-[max(1rem,var(--sar))] pt-[max(2.5rem,var(--sat))] pb-[max(2.5rem,var(--sab))]">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <Clock compact={view.name !== "login"} />
        </motion.div>

        <motion.div layout className="w-full max-w-[380px]" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
          <motion.div ref={sheen} layout animate={shake} className="mat-glass sheen relative overflow-hidden rounded-[28px] p-6 sm:p-7">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view.name} initial={{ opacity: 0, x: 16, filter: "blur(4px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: -16, filter: "blur(4px)" }} transition={{ duration: 0.22 }}>
                {view.name === "login" && (
                  <form onSubmit={submitLogin} noValidate>
                    <Header title="Personal OS" subtitle={t("Sign in to continue")} />
                    <div className="relative mt-6 space-y-2.5">
                      <TextField icon={<User className="h-4 w-4" />} label={t("Username or email")} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus />
                      <PasswordField label={t("Password")} value={password} onChange={setPassword} autoComplete="current-password" />
                    </div>
                    <div className="mt-2 flex justify-end"><button type="button" className={linkBtn} onClick={() => go({ name: "forgot" })}>{t("Forgot password?")}</button></div>
                    <Message error={error} notice={notice} />
                    <Button type="submit" variant="primary" loading={busy} className="relative mt-1 h-11 w-full rounded-xl text-[15px]">{t("Sign in")} {!busy && <ArrowRight className="h-4 w-4" />}</Button>
                  </form>
                )}

                {view.name === "register" && (
                  <form onSubmit={submitRegister} noValidate>
                    <Header title={t("Create account")} subtitle={t("Your own private space: tasks, goals, habits and money.")} />
                    <div className="relative mt-6 space-y-2.5">
                      <TextField icon={<AtSign className="h-4 w-4" />} label={t("Username")} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" autoCapitalize="none" autoFocus maxLength={32} />
                      <p className="px-1 text-[11px] text-ink-3">{t("3–32 characters: latin letters, digits, “_” or “.”")}</p>
                      <TextField icon={<Mail className="h-4 w-4" />} type="email" label={t("Email")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
                      <PasswordField label={t("Password (8+ characters)")} value={password} onChange={setPassword} autoComplete="new-password" />
                      <Strength password={password} />
                    </div>
                    <Message error={error} notice={notice} />
                    <Button type="submit" variant="primary" loading={busy} className="relative mt-1 h-11 w-full rounded-xl text-[15px]">{t("Create account")}</Button>
                    <p className="mt-3 text-center text-[11px] text-ink-3">{t("We'll email you a code to confirm the address.")}</p>
                  </form>
                )}

                {view.name === "verify" && (
                  <form onSubmit={(e) => { e.preventDefault(); submitCode(); }} noValidate>
                    <Header icon={<IconBadge><Mail className="h-6 w-6" /></IconBadge>} title={t("Check your email")}
                      subtitle={<>{t("Enter the 6-digit code we sent to")} <b className="text-ink font-medium break-all">{view.email}</b></>} />
                    <div className="mt-6"><CodeInput value={code} onChange={setCode} onComplete={submitCode} disabled={busy} /></div>
                    <Message error={error} notice={notice} />
                    <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6} className="relative mt-1 h-11 w-full rounded-xl text-[15px]">{t("Confirm")}</Button>
                    <ResendRow left={resendIn} onResend={resend} busy={busy} />
                    <p className="mt-2 text-center text-[11px] text-ink-3">{t("The email comes from {sender}. Check Spam if you don't see it.", { sender: "spokeesofficial@gmail.com" })}</p>
                  </form>
                )}

                {view.name === "forgot" && (
                  <form onSubmit={submitForgot} noValidate>
                    <Header icon={<IconBadge><KeyRound className="h-6 w-6" /></IconBadge>} title={t("Reset password")} subtitle={t("We'll send a code to the email of your account.")} />
                    <div className="relative mt-6"><TextField icon={<User className="h-4 w-4" />} label={t("Username or email")} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus /></div>
                    <Message error={error} notice={notice} />
                    <Button type="submit" variant="primary" loading={busy} className="relative mt-1 h-11 w-full rounded-xl text-[15px]">{t("Send code")}</Button>
                  </form>
                )}

                {view.name === "reset" && (
                  <form onSubmit={submitReset} noValidate>
                    <Header icon={<IconBadge><KeyRound className="h-6 w-6" /></IconBadge>} title={t("New password")} subtitle={t("Enter the code from the email and choose a new password.")} />
                    <div className="mt-6 space-y-3">
                      <CodeInput value={code} onChange={setCode} onComplete={() => undefined} disabled={busy} />
                      <PasswordField label={t("New password (8+ characters)")} value={password} onChange={setPassword} autoComplete="new-password" />
                      <Strength password={password} />
                    </div>
                    <Message error={error} notice={notice} />
                    <Button type="submit" variant="primary" loading={busy} className="relative mt-1 h-11 w-full rounded-xl text-[15px]">{t("Save and sign in")}</Button>
                    <ResendRow left={resendIn} onResend={resend} busy={busy} />
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          <div className="mt-5 flex flex-col items-center gap-3 rounded-3xl bg-black/60 px-4 py-3 backdrop-blur-md">
            {footer}
            <div className="flex justify-center gap-1" role="radiogroup" aria-label={t("Language")}>
              {LANGUAGES.map((l) => (
                <button key={l.id} role="radio" aria-checked={lang === l.id} onClick={() => setLang(l.id)}
                  className={cn("rounded-full px-3 py-1 text-[13px] text-white transition-colors hover:bg-white/15", lang === l.id && "bg-white/20 font-medium")}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function IconBadge({ children }: { children: ReactNode }) {
  return <div className="h-14 w-14 rounded-full grid place-items-center bg-accent/12 text-accent ring-1 ring-accent/20">{children}</div>;
}

function Message({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <div className="relative min-h-[20px] my-2.5 text-center text-[13px]" role={error ? "alert" : "status"}>
      {error ? <span className="text-bad">{error}</span> : notice ? <span className="text-ink-2">{notice}</span> : null}
    </div>
  );
}

function ResendRow({ left, onResend, busy }: { left: number; onResend: () => void; busy: boolean }) {
  return (
    <div className="mt-3 text-center text-[13px] text-ink-3">
      {left > 0 ? t("Resend code in {s} s", { s: left }) : <button type="button" disabled={busy} className={linkBtn} onClick={onResend}>{t("Resend code")}</button>}
    </div>
  );
}
