import { useQuery } from "@tanstack/react-query";
import { Check, Database, KeyRound, Palette, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";
import { useAction, useSettings } from "@/lib/queries";
import { useTheme, WALLPAPERS, type ThemeMode } from "@/lib/theme";
import { useConfirm } from "@/components/ui/dialog";
import { Button, Card, CardHeader, cn, Field, Input, Segmented, Select } from "@/components/ui/primitives";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const ZONES = ["Asia/Almaty", "Asia/Aqtobe", "Asia/Qostanay", "Asia/Oral", "Asia/Tashkent", "Asia/Bishkek", "Europe/Moscow", "Europe/Istanbul", "Asia/Dubai", "Europe/Berlin", "Europe/London", "America/New_York", "UTC"];

function AppearanceCard() {
  const { mode, setMode, wallpaper, setWallpaper } = useTheme();
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Palette className="h-4 w-4 text-ink-3" /> Appearance</span>}
        subtitle="Stored in this browser. Glass surfaces show the wallpaper through; text always sits on a near-opaque layer." />
      <div className="px-5 pb-5 space-y-4">
        <Segmented<ThemeMode> value={mode} onChange={setMode} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Match system" }]} />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5" role="radiogroup" aria-label="Wallpaper">
          {WALLPAPERS.map((w) => (
            <button key={w.id} role="radio" aria-checked={wallpaper === w.id} onClick={() => setWallpaper(w.id)} className="group text-left">
              <span className={cn("relative block aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-line/10 transition-shadow", wallpaper === w.id && "ring-2 ring-accent")}
                style={{ background: w.src ? w.color : "linear-gradient(135deg, rgb(var(--bg)), rgb(var(--surface)))" }}>
                {w.src && <img src={w.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                {wallpaper === w.id && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>}
              </span>
              <span className="mt-1.5 block text-xs text-ink-2">{w.label}</span>
            </button>
          ))}
        </div>
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

  const save = useAction((body: Record<string, unknown>) => api.patch("/settings", body), { success: "Settings saved" });
  const seed = useAction(() => api.post("/demo"), { success: "Demo data loaded" });
  const unseed = useAction(() => api.del<{ removed: Record<string, number>; kept_accounts: string[] }>("/demo"), {
    success: (r) => {
      const res = r as { kept_accounts: string[] };
      return res.kept_accounts.length ? `Demo data removed. Kept ${res.kept_accounts.join(", ")} (contains your own records).` : "Demo data removed";
    },
  });

  return (
    <div className="max-w-2xl space-y-5">
      <AppearanceCard />
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><User className="h-4 w-4 text-ink-3" /> Profile & preferences</span>} />
        <form className="px-5 pb-5 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ owner_name: name.trim(), timezone: tz }); }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Your name" hint="Used in the greeting">{(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Timezone" hint="Defines 'today' for tasks, habits and schedules">{(id) => (
              <Select id={id} value={tz} onChange={(e) => setTz(e.target.value)}>
                {[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
              </Select>
            )}</Field>
          </div>
          <p className="text-xs text-ink-3">Primary currency: <b className="text-ink-2">{settings?.primary_currency ?? "KZT"}</b>. Budgets and analytics use it; accounts in other currencies are never added into its totals.</p>
          <Button type="submit" variant="primary" loading={save.isPending}>Save</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Database className="h-4 w-4 text-ink-3" /> Demo data</span>}
          subtitle="Invented example records to explore the app. They are labelled “demo” everywhere and can be removed in one click; your own records are never touched." />
        <div className="px-5 pb-5 flex gap-2">
          {demo?.loaded ? (
            <Button variant="danger" loading={unseed.isPending} onClick={async () => { if (await confirm({ title: "Remove all demo data?", body: "Deletes every record marked demo (accounts, transactions, budgets, tasks, goals, habits…).", confirmLabel: "Remove demo data" })) unseed.mutate(undefined); }}>
              <Trash2 className="h-4 w-4" /> Remove demo data
            </Button>
          ) : (
            <Button loading={seed.isPending} onClick={() => seed.mutate(undefined)}>Load demo data</Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-ink-3" /> API access token</span>}
          subtitle="Only needed if the backend was started with POS_API_TOKEN. Stored in this browser only." />
        <form className="px-5 pb-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); setToken(token.trim()); qc.invalidateQueries(); toast.success(token.trim() ? "Token saved" : "Token cleared"); }}>
          <Input type="password" autoComplete="off" value={token} placeholder="Bearer token" onChange={(e) => setTokenInput(e.target.value)} />
          <Button type="submit">Save</Button>
        </form>
      </Card>

      <Card className="px-5 py-4 text-xs text-ink-3 leading-relaxed">
        <p className="text-ink-2 font-medium mb-1">Privacy</p>
        Personal OS stores everything in your own PostgreSQL database. The API listens on localhost by default and nothing is sent to external services.
        Running locally is not by itself “secure”: anyone with access to this computer, the database, or an unprotected port can read your data. See the README for the deployment model and its limitations.
      </Card>
    </div>
  );
}
