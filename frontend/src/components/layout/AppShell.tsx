import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight, BarChart3, CalendarClock, Check, CheckSquare, ChevronDown, Command, CreditCard, Flame, Landmark, Languages, LayoutDashboard, LogOut, Menu, Monitor,
  Moon, PanelLeftClose, PanelLeftOpen, PiggyBank, Plus, Search, Settings, Sun, Target, X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { format, LANGUAGES, t, useLang } from "@/lib/i18n";
import { useAccounts } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import type { Dashboard, Profile } from "@/lib/types";
import { Button, cn } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthGate";
import { CommandPalette } from "./CommandPalette";
import { useQuickActions } from "./QuickActions";

// Labels stay in English here and are translated at render time (t() must not run at import).
type NavItem = { to: string; label: string; short?: string; icon: typeof LayoutDashboard; end?: boolean; badge?: (d?: Dashboard) => ReactNode };

const PERSONAL: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, badge: (d) => (d ? d.tasks.counts.today + d.tasks.counts.overdue || null : null) },
  { to: "/goals", label: "Goals & Projects", short: "Goals", icon: Target, badge: (d) => d?.goals.length || null },
  { to: "/habits", label: "Habits", icon: Flame, badge: (d) => (d && d.habits.scheduled_today ? `${d.habits.done_today}/${d.habits.scheduled_today}` : null) },
];
const MONEY: NavItem[] = [
  { to: "/finances/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/finances/accounts", label: "Accounts", icon: Landmark },
  { to: "/finances/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/finances/recurring", label: "Recurring", icon: CalendarClock },
  { to: "/finances/installments", label: "Installments", icon: CreditCard },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const TITLES: [string, string, string][] = [
  ["/finances/transactions", "Transactions", "Every income, expense and transfer"],
  ["/finances/accounts", "Accounts", "Balances and categories"],
  ["/finances/budgets", "Budgets", "Monthly limits vs actual spending"],
  ["/finances/recurring", "Recurring", "Expected payments and income"],
  ["/finances/installments", "Installments", "Repayment obligations"],
  ["/analytics", "Analytics", "Cash flow, categories and trends"],
  ["/tasks", "Tasks", "Plan the day"],
  ["/goals", "Goals & Projects", "Long-term direction"],
  ["/habits", "Habits", "Consistency over streaks"],
  ["/settings", "Settings", "Appearance, language and data"],
  ["/profile", "Profile", "Personal info, income and security"],
];

// ---------------------------------------------------------------- wallpaper

function Wallpaper() {
  const { active: wp, resolved } = useTheme();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [wp.src]);
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden style={{ background: wp.src ? wp.color : undefined }}>
      {!wp.src && <div className="absolute inset-0" style={{ background: resolved === "dark" ? "radial-gradient(120% 90% at 20% 0%, #1b2a44, #0a0a0e 60%)" : "radial-gradient(120% 90% at 20% 0%, #dfe8f6, #e9e7ef 60%)" }} />}
      {wp.src && (
        <img src={wp.src} alt="" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)}
          className={cn("absolute inset-0 h-full w-full object-cover scale-105 transition-opacity duration-700", loaded ? "opacity-100" : "opacity-0")} />
      )}
      <div className="absolute inset-0" style={{
        background: resolved === "dark"
          ? "linear-gradient(180deg, rgb(6 8 12 / 0.45), rgb(6 8 12 / 0.7))"
          : "linear-gradient(180deg, rgb(236 239 245 / 0.25), rgb(236 239 245 / 0.5))",
      }} />
    </div>
  );
}

// ---------------------------------------------------------------- sidebar

function SideLink({ item, data, onNavigate }: { item: NavItem; data?: Dashboard; onNavigate?: () => void }) {
  const { to, label, icon: Icon, end, badge } = item;
  const b = badge?.(data);
  return (
    <NavLink to={to} end={end} onClick={onNavigate}
      className={({ isActive }) => cn("relative flex items-center gap-2.5 h-8 px-2.5 rounded-[8px] text-[13.5px] transition-colors", isActive ? "text-ink font-medium" : "text-ink-2 hover:bg-fill/[0.05]")}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="side-active" className="absolute inset-0 rounded-[8px] bg-fill/[0.09] shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4)]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <Icon className="relative h-[17px] w-[17px] text-accent" strokeWidth={1.8} />
          <span className="relative flex-1 truncate">{t(label)}</span>
          {b !== null && b !== undefined && <span className="relative text-xs text-ink-3 tnum">{b}</span>}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard"), staleTime: 15_000 });
  const { data: accounts = [] } = useAccounts();
  const { data: demo } = useQuery({ queryKey: ["demo"], queryFn: () => api.get<{ loaded: boolean }>("/demo"), staleTime: 30_000 });
  const active = accounts.filter((a) => !a.is_archived);
  return (
    <div className="flex h-full flex-col px-2.5 pb-3">
      <div className="flex h-14 items-center gap-2.5 px-2">
        <div className="h-7 w-7 rounded-[8px] grid place-items-center text-accent-ink text-[13px] font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_2px_6px_rgb(var(--accent)/0.35)]" style={{ background: "linear-gradient(145deg, color-mix(in srgb, rgb(var(--accent)) 70%, white), rgb(var(--accent)))" }}>P</div>
        <span className="flex-1 text-[15px] font-semibold tracking-tight">Personal OS</span>
        {onCollapse && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("Hide sidebar")} onClick={onCollapse}><PanelLeftClose className="h-4 w-4" /></Button>}
      </div>
      <nav className="flex-1 overflow-y-auto space-y-4 pt-1" aria-label={t("Main")}>
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-xs font-semibold text-ink-3">{t("Personal")}</p>
          {PERSONAL.map((i) => <SideLink key={i.to} item={i} data={data} onNavigate={onNavigate} />)}
        </div>
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-xs font-semibold text-ink-3">{t("Money")}</p>
          {MONEY.map((i) => <SideLink key={i.to} item={i} data={data} onNavigate={onNavigate} />)}
        </div>
        {active.length > 0 && (
          <div>
            <p className="px-2.5 pb-1 text-xs font-semibold text-ink-3">{t("Balances")}</p>
            {active.slice(0, 6).map((a) => (
              <Link key={a.id} to={`/finances/transactions?account_id=${a.id}`} onClick={onNavigate} className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-[8px] text-[13px] hover:bg-fill/[0.05]">
                <span className="truncate text-ink-2">{a.name}</span>
                <span className={cn("tnum shrink-0", a.current_balance.startsWith("-") ? "text-bad" : "text-ink")}>{formatMoney(a.current_balance, a.currency)}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>
      <div className="pt-2 space-y-1.5">
        {demo?.loaded && (
          <Link to="/settings" onClick={onNavigate} className="block mx-1 rounded-[8px] border border-demo/30 bg-demo/10 px-2.5 py-1.5 text-xs text-demo">
            <b>{t("Demo data loaded")}</b> — {t("examples, not your finances.")}
          </Link>
        )}
        <SideLink item={{ to: "/settings", label: "Settings", icon: Settings }} onNavigate={onNavigate} />
        <ProfileChip onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/** Initials avatar or uploaded photo. */
export function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return src
    ? <img src={src} alt="" className={cn("rounded-full object-cover ring-1 ring-line/10", className)} />
    : <span className={cn("grid place-items-center rounded-full text-accent-ink font-semibold ring-1 ring-white/20", className)} style={{ background: "linear-gradient(145deg, color-mix(in srgb, rgb(var(--accent)) 65%, #7b8cff), rgb(var(--accent)))" }}>{initials}</span>;
}

function ProfileChip({ onNavigate }: { onNavigate?: () => void }) {
  const { username, logout } = useAuth();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile>("/profile"), staleTime: 60_000 });
  const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  return (
    <div className="flex items-center gap-1 rounded-[10px] hover:bg-fill/[0.05] transition-colors">
      <NavLink to="/profile" onClick={onNavigate} className={({ isActive }) => cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1.5", isActive && "bg-fill/[0.09]")}>
        <Avatar src={profile?.avatar_url} name={full || username || ""} className="h-8 w-8 shrink-0 text-xs" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13.5px] font-medium">{full || username}</span>
          <span className="block truncate text-xs text-ink-3">{username ? `@${username}` : t("Profile")}</span>
        </span>
      </NavLink>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t("Sign out")} title={t("Sign out")} onClick={() => void logout()}>
        <LogOut className="h-4 w-4 text-ink-3" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- toolbar menus

const menuContent = "mat-popover z-50 min-w-[220px] rounded-xl p-1 text-[13.5px] data-[state=open]:animate-[dlg-fade_0.14s_ease-out]";
const menuItem = "flex items-center gap-2.5 h-8 px-2.5 rounded-[7px] outline-none cursor-default select-none data-[highlighted]:bg-accent data-[highlighted]:text-white";

function ThemeMenu() {
  const { mode, setMode, resolved } = useTheme();
  const options = [{ v: "light", label: "Light", icon: Sun }, { v: "dark", label: "Dark", icon: Moon }, { v: "system", label: "Match system", icon: Monitor }] as const;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("Appearance")}>{resolved === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={menuContent}>
          {options.map(({ v, label, icon: Icon }) => (
            <DropdownMenu.Item key={v} className={menuItem} onSelect={() => setMode(v)}>
              <Icon className="h-4 w-4" /> <span className="flex-1">{t(label)}</span> {mode === v && <Check className="h-4 w-4" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function LanguageMenu() {
  const { lang, setLang } = useLang();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("Language")}><Languages className="h-4 w-4" /></Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={menuContent}>
          {LANGUAGES.map((l) => (
            <DropdownMenu.Item key={l.id} className={menuItem} onSelect={() => setLang(l.id)}>
              <span className="w-5 text-center text-xs font-semibold opacity-70">{l.short}</span> <span className="flex-1">{l.label}</span> {lang === l.id && <Check className="h-4 w-4" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NewMenu() {
  const qa = useQuickActions();
  const navigate = useNavigate();
  return (
    <div className="flex">
      <Button variant="primary" size="sm" className="h-8 rounded-r-none px-3" onClick={() => qa.newTransaction()}>
        <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t("New Transaction")}</span>
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="primary" size="sm" className="h-8 rounded-l-none border-l border-white/25 px-1.5" aria-label={t("More create options")}><ChevronDown className="h-4 w-4" /></Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className={menuContent}>
            <DropdownMenu.Item className={menuItem} onSelect={() => qa.newTransaction()}><ArrowLeftRight className="h-4 w-4" /><span className="flex-1">{t("Transaction")}</span><kbd className="text-xs opacity-70">T</kbd></DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => qa.newTask()}><CheckSquare className="h-4 w-4" /><span className="flex-1">{t("Task")}</span><kbd className="text-xs opacity-70">N</kbd></DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-line/10" />
            <DropdownMenu.Item className={menuItem} onSelect={() => navigate("/goals?new=1")}><Target className="h-4 w-4" />{t("Goal")}</DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => navigate("/habits?new=1")}><Flame className="h-4 w-4" />{t("Habit")}</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

// ---------------------------------------------------------------- shell

export function AppShell() {
  const location = useLocation();
  const outlet = useOutlet();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("pos.sidebar") === "collapsed"; } catch { return false; } });
  const [palette, setPalette] = useState(false);
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => { try { localStorage.setItem("pos.sidebar", collapsed ? "collapsed" : "open"); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [title, subtitle] = (() => {
    if (location.pathname === "/") return [t("Overview"), format(new Date(), "PPPP")];
    const hit = TITLES.find(([p]) => location.pathname.startsWith(p));
    return hit ? [t(hit[1]), t(hit[2])] : ["Personal OS", ""];
  })();

  return (
    <>
      <Wallpaper />
      <div className="fixed inset-0 lg:inset-2.5 flex overflow-hidden lg:rounded-[16px]" style={{ boxShadow: "var(--window-shadow)" }}>
        {/* Sidebar: the wallpaper shows through (strongest material) */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.aside key="side" className="hidden lg:block shrink-0 mat-chrome border-r hairline overflow-hidden"
              initial={{ width: 0, opacity: 0 }} animate={{ width: 252, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.25, 0.8, 0.25, 1] }}>
              <div className="w-[252px] h-full"><SidebarContent onCollapse={() => setCollapsed(true)} /></div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="relative flex-1 min-w-0 flex flex-col bg-surface/55 backdrop-blur-2xl">
          <header className="flex h-[calc(3.5rem+var(--sat))] shrink-0 items-center gap-2 pt-[var(--sat)] pl-[max(0.75rem,var(--sal))] pr-[max(0.75rem,var(--sar))] lg:h-14 lg:pt-0 lg:px-4 border-b hairline bg-surface/50 backdrop-blur-xl">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("Open menu")} onClick={() => setMobileOpen(true)}><Menu className="h-4 w-4" /></Button>
            {collapsed && <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label={t("Show sidebar")} onClick={() => setCollapsed(false)}><PanelLeftOpen className="h-4 w-4" /></Button>}
            <div className="min-w-0 flex-1 pl-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <h1 className="text-[15px] font-semibold leading-5 truncate">{title}</h1>
                  <p className="text-xs text-ink-3 truncate tnum">{subtitle}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <button onClick={() => setPalette(true)} className="field hidden md:flex items-center gap-2 h-8 w-[260px] rounded-lg px-2.5 text-[13px] text-ink-3 hover:bg-fill/[0.07] transition-colors">
              <Search className="h-3.5 w-3.5" /> <span className="flex-1 text-left">{t("Search or run a command")}</span>
              <kbd className="inline-flex items-center gap-0.5 rounded bg-surface px-1.5 py-0.5 text-[11px] border hairline"><Command className="h-3 w-3" />K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("Search")} onClick={() => setPalette(true)}><Search className="h-4 w-4" /></Button>
            <LanguageMenu />
            <ThemeMenu />
            <NewMenu />
          </header>

          <main className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={location.pathname}
                initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-full max-w-[1680px] pl-[max(1rem,var(--sal))] pr-[max(1rem,var(--sar))] py-5 lg:px-6 lg:py-6 pb-[calc(7rem+var(--sab))] lg:pb-8">
                {outlet}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40">
            <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside className="absolute left-[max(0.5rem,var(--sal))] top-[max(0.5rem,var(--sat))] bottom-[max(0.5rem,var(--sab))] w-[272px] max-w-[calc(100vw-1rem)] rounded-2xl mat-popover overflow-hidden"
              initial={{ x: "-110%" }} animate={{ x: 0 }} exit={{ x: "-110%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
              <Button variant="ghost" size="icon" className="absolute right-2 top-3 z-10" aria-label={t("Close menu")} onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></Button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile tab bar: floating glass */}
      <nav className="lg:hidden fixed bottom-[max(0.75rem,var(--sab))] left-[max(0.75rem,var(--sal))] right-[max(0.75rem,var(--sar))] z-30 grid grid-cols-5 rounded-2xl mat-glass p-1" aria-label={t("Primary")}>
        {([PERSONAL[0], PERSONAL[1], { to: "/finances/transactions", label: "Money", icon: ArrowLeftRight }, PERSONAL[3], { to: "/analytics", label: "Analytics", icon: BarChart3 }] as NavItem[]).map(({ to, label, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px]", isActive ? "text-accent bg-fill/[0.06]" : "text-ink-2")}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {t(short ?? label)}
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={palette} onOpenChange={setPalette} />
    </>
  );
}
