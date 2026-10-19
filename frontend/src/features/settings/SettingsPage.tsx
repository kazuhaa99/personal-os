import { useQuery } from "@tanstack/react-query";
import { Check, Database, ImagePlus, KeyRound, Languages, Loader2, LogOut, Palette, Trash2, Upload, User, UserCircle } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { api, getToken, setToken } from "@/lib/api";
import { LANGUAGES, t, useLang, type Lang } from "@/lib/i18n";
import { useAction, useSettings } from "@/lib/queries";
import { useTheme, WALLPAPERS, type ThemeMode } from "@/lib/theme";
import { MAX_UPLOAD_BYTES } from "@/lib/wallpaperStore";
import { useAuth } from "@/features/auth/AuthGate";
import { useConfirm } from "@/components/ui/dialog";
import { Button, Card, CardHeader, cn, Field, Input, Segmented, Select } from "@/components/ui/primitives";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const ZONES = ["Asia/Almaty", "Asia/Aqtobe", "Asia/Qostanay", "Asia/Oral", "Asia/Tashkent", "Asia/Bishkek", "Europe/Moscow", "Europe/Istanbul", "Asia/Dubai", "Europe/Berlin", "Europe/London", "America/New_York", "UTC"];

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

function uploadError(e: unknown) {
  const code = e instanceof Error ? e.message : "";
  if (code === "not-image") return t("That file isn't an image we can read");
  if (code === "too-large") return t("The photo is too large (max {mb} MB)", { mb: MAX_MB });
  return t("Couldn't save the photo");
}

function AppearanceCard() {
  const { mode, setMode, wallpaper, setWallpaper, custom, uploadWallpaper, removeCustomWallpaper } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  async function upload(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      await uploadWallpaper(file);
      toast.success(t("Wallpaper updated"));
    } catch (e) {
      toast.error(uploadError(e));
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    try {
      await removeCustomWallpaper();
      toast.success(t("Photo removed"));
    } catch {
      toast.error(t("Couldn't remove the photo"));
    }
  }

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dragProps = {
    onDragEnter: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true); },
    onDragOver: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
    onDragLeave: (e: DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void upload(e.dataTransfer.files[0]);
    },
  };

  const tileFrame = "relative block aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-line/10 transition-shadow";
  const selectedMark = <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>;

  return (
    <div {...dragProps}>
    <Card className={cn("transition-shadow", dragging && "ring-2 ring-accent/60")}>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Palette className="h-4 w-4 text-ink-3" /> {t("Appearance")}</span>}
        subtitle={t("Stored in this browser, including your own photo — it isn't uploaded to the server. Glass surfaces show the wallpaper through; text always sits on a near-opaque layer.")} />
      <div className="px-5 pb-5 space-y-4">
        <Segmented<ThemeMode> value={mode} onChange={setMode} options={[{ value: "light", label: t("Light") }, { value: "dark", label: t("Dark") }, { value: "system", label: t("Match system") }]} />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5" role="radiogroup" aria-label={t("Wallpaper")}>
          {WALLPAPERS.map((w) => (
            <button key={w.id} type="button" role="radio" aria-checked={wallpaper === w.id} onClick={() => setWallpaper(w.id)} className="group text-left">
              <span className={cn(tileFrame, wallpaper === w.id && "ring-2 ring-accent")}
                style={{ background: w.src ? w.color : "linear-gradient(135deg, rgb(var(--bg)), rgb(var(--surface)))" }}>
                {w.src && <img src={w.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                {wallpaper === w.id && selectedMark}
              </span>
              <span className="mt-1.5 block text-xs text-ink-2 truncate">{t(w.label)}</span>
            </button>
          ))}

          {custom ? (
            <div className="group relative text-left">
              <button type="button" role="radio" aria-checked={wallpaper === "custom"} onClick={() => setWallpaper("custom")} className="block w-full text-left">
                <span className={cn(tileFrame, wallpaper === "custom" && "ring-2 ring-accent")} style={{ background: custom.color }}>
                  <img src={custom.src} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  {wallpaper === "custom" && !uploading && selectedMark}
                  {uploading && <span className="absolute inset-0 grid place-items-center bg-black/35"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>}
                </span>
                <span className="mt-1.5 block text-xs text-ink-2 truncate">{t("Your photo")}</span>
              </button>
              {!uploading && (
                <span className="absolute left-1.5 top-1.5 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                  <button type="button" aria-label={t("Replace photo")} title={t("Replace photo")}
                    onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                    className="grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70">
                    <Upload className="h-3 w-3" />
                  </button>
                  <button type="button" aria-label={t("Remove photo")} title={t("Remove photo")}
                    onClick={(e) => { e.stopPropagation(); void remove(); }}
                    className="grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="group text-left" aria-label={t("Upload photo")}>
              <span className={cn(tileFrame, "ring-0 grid place-items-center border-2 border-dashed border-line/25 text-ink-3 group-hover:border-accent/60 group-hover:text-accent transition-colors", dragging && "border-accent/70 text-accent")}>
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </span>
              <span className="mt-1.5 block text-xs text-ink-2 truncate">{uploading ? t("Uploading…") : t("Upload photo")}</span>
            </button>
          )}
        </div>
        <p className="text-2xs text-ink-3">{t("Tip: drop an image onto this card to use it as wallpaper. Up to {mb} MB.", { mb: MAX_MB })}</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload(f); }} />
      </div>
    </Card>
    </div>
  );
}

function LanguageCard() {
  const { lang, setLang } = useLang();
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Languages className="h-4 w-4 text-ink-3" /> {t("Language")}</span>}
        subtitle={t("Interface language. Your own records stay as you typed them.")} />
      <div className="px-5 pb-5">
        <Segmented<Lang> value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
      </div>
    </Card>
  );
}

function AccountCard() {
  const { username, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><UserCircle className="h-4 w-4 text-ink-3" /> {t("Sign-in")}</span>}
        subtitle={<>{t("The username and password are set on the server with")} <code className="text-ink-2">POS_AUTH_USERNAME</code> / <code className="text-ink-2">POS_AUTH_PASSWORD</code>.</>} />
      <div className="px-5 pb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {username ? t("Signed in as {username}", { username }) : t("Not signed in")}
        </p>
        {username && (
          <Button loading={busy} onClick={async () => { setBusy(true); try { await logout(); } finally { setBusy(false); } }}>
            {!busy && <LogOut className="h-4 w-4" />} {t("Sign out")}
          </Button>
        )}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: demo } = useQuery({ queryKey: ["demo"], queryFn: () => api.get<{ loaded: boolean }>("/demo") });
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [tz, setTz] = useState("Asia/Almaty");
  const [token, setTokenInput] = useState(getToken());
  useEffect(() => { if (settings) { setName(settings.owner_name); setTz(settings.timezone); } }, [settings]);

  const save = useAction((body: Record<string, unknown>) => api.patch("/settings", body), { success: t("Settings saved") });
  const seed = useAction(() => api.post("/demo"), { success: t("Demo data loaded") });
  const unseed = useAction(() => api.del<{ removed: Record<string, number>; kept_accounts: string[] }>("/demo"), {
    success: (r) => {
      const res = r as { kept_accounts: string[] };
      return res.kept_accounts.length ? t("Demo data removed. Kept {accounts} (contains your own records).", { accounts: res.kept_accounts.join(", ") }) : t("Demo data removed");
    },
  });

  return (
    <div className="max-w-2xl space-y-5">
      <AppearanceCard />
      <LanguageCard />
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><User className="h-4 w-4 text-ink-3" /> {t("Profile & preferences")}</span>} />
        <form className="px-5 pb-5 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ owner_name: name.trim(), timezone: tz }); }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t("Your name")} hint={t("Used in the greeting")}>{(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label={t("Timezone")} hint={t("Defines 'today' for tasks, habits and schedules")}>{(id) => (
              <Select id={id} value={tz} onChange={(e) => setTz(e.target.value)}>
                {[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
              </Select>
            )}</Field>
          </div>
          <p className="text-xs text-ink-3">{t("Primary currency:")} <b className="text-ink-2">{settings?.primary_currency ?? "KZT"}</b>. {t("Budgets and analytics use it; accounts in other currencies are never added into its totals.")}</p>
          <Button type="submit" variant="primary" loading={save.isPending}>{t("Save")}</Button>
        </form>
      </Card>

      <AccountCard />

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Database className="h-4 w-4 text-ink-3" /> {t("Demo data")}</span>}
          subtitle={t("Invented example records to explore the app. They are labelled “demo” everywhere and can be removed in one click; your own records are never touched.")} />
        <div className="px-5 pb-5 flex gap-2">
          {demo?.loaded ? (
            <Button variant="danger" loading={unseed.isPending} onClick={async () => { if (await confirm({ title: t("Remove all demo data?"), body: t("Deletes every record marked demo (accounts, transactions, budgets, tasks, goals, habits…)."), confirmLabel: t("Remove demo data") })) unseed.mutate(undefined); }}>
              <Trash2 className="h-4 w-4" /> {t("Remove demo data")}
            </Button>
          ) : (
            <Button loading={seed.isPending} onClick={() => seed.mutate(undefined)}>{t("Load demo data")}</Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-ink-3" /> {t("API access token")}</span>}
          subtitle={t("For scripts and integrations only — the web app uses your login. Needed if the backend was started with POS_API_TOKEN. Stored in this browser only.")} />
        <form className="px-5 pb-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); setToken(token.trim()); qc.invalidateQueries(); toast.success(token.trim() ? t("Token saved") : t("Token cleared")); }}>
          <Input type="password" autoComplete="off" value={token} placeholder={t("Bearer token")} aria-label={t("API access token")} onChange={(e) => setTokenInput(e.target.value)} />
          <Button type="submit">{t("Save")}</Button>
        </form>
      </Card>

      <Card className="px-5 py-4 text-xs text-ink-3 leading-relaxed">
        <p className="text-ink-2 font-medium mb-1">{t("Privacy")}</p>
        {t("Personal OS stores everything in your own PostgreSQL database. The API listens on localhost by default and nothing is sent to external services.")}{" "}
        {t("Running locally is not by itself “secure”: anyone with access to this computer, the database, or an unprotected port can read your data. See the README for the deployment model and its limitations.")}
      </Card>
    </div>
  );
}
