import { motion, useAnimationControls } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { format, LANGUAGES, t, useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useSheen } from "@/lib/useSheen";
import { Button, cn } from "@/components/ui/primitives";

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

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 10_000); return () => clearInterval(id); }, []);
  return (
    <div className="text-center text-white [text-shadow:0_1px_12px_rgb(0_0_0/0.25)] select-none">
      <p className="text-[15px] font-medium opacity-90 capitalize">{format(now, t("EEEE, d MMMM"))}</p>
      <p className="font-display text-[76px] sm:text-[96px] leading-none font-semibold tracking-tight tnum mt-1">{format(now, "HH:mm")}</p>
    </div>
  );
}

const fieldWrap = "field flex items-center gap-2.5 h-11 rounded-xl px-3.5 focus-within:ring-2 focus-within:ring-accent/50 transition-shadow";

export function LoginPage({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const { lang, setLang } = useLang();
  const sheen = useSheen<HTMLFormElement>();
  const shake = useAnimationControls();
  const userRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => userRef.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError(t("Enter your username and password")); shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } }); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ username: string }>("/auth/login", { username: username.trim(), password });
      onSignedIn(r.username);
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg === "Wrong username or password" ? t(msg) : msg.startsWith("Too many attempts") ? t("Too many attempts. Try again in a few minutes.") : msg);
      setPassword("");
      shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto">
      <Backdrop />
      <div className="min-h-full flex flex-col items-center justify-center gap-10 px-4 py-10">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <Clock />
        </motion.div>

        <motion.div className="w-full max-w-[380px]" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
          <motion.form ref={sheen} animate={shake} onSubmit={submit} noValidate className="mat-glass sheen relative rounded-[28px] p-6 sm:p-7">
            <div className="relative flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-[16px] grid place-items-center text-white text-2xl font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_18px_rgb(10_112_240/0.4)]" style={{ background: "linear-gradient(145deg, #4aa3ff, #0a62e0)" }}>P</div>
              <h1 className="mt-4 text-[22px] font-semibold tracking-tight">Personal OS</h1>
              <p className="mt-1 text-sm text-ink-2">{t("Sign in to continue")}</p>
            </div>

            <div className="relative mt-6 space-y-2.5">
              <div className={fieldWrap}>
                <User className="h-4 w-4 shrink-0 text-ink-3" />
                <input ref={userRef} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false}
                  placeholder={t("Username")} aria-label={t("Username")} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none focus-visible:outline-none placeholder:text-ink-3" />
              </div>
              <div className={fieldWrap}>
                <Lock className="h-4 w-4 shrink-0 text-ink-3" />
                <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  placeholder={t("Password")} aria-label={t("Password")} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none focus-visible:outline-none placeholder:text-ink-3" />
                <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-3 hover:text-ink-2" aria-label={show ? t("Hide password") : t("Show password")}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="relative min-h-[20px] mt-2.5 text-center text-[13px] text-bad" role="alert">{error}</div>

            <Button type="submit" variant="primary" loading={busy} className="relative mt-1.5 h-11 w-full rounded-xl text-[15px]">
              {t("Sign in")} {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
          </motion.form>

          <div className="mt-5 flex justify-center gap-1" role="radiogroup" aria-label={t("Language")}>
            {LANGUAGES.map((l) => (
              <button key={l.id} role="radio" aria-checked={lang === l.id} onClick={() => setLang(l.id)}
                className={cn("rounded-full px-3 py-1 text-[13px] text-white/85 transition-colors hover:bg-white/15 [text-shadow:0_1px_6px_rgb(0_0_0/0.3)]", lang === l.id && "bg-white/20 text-white font-medium backdrop-blur-md")}>
                {l.label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
