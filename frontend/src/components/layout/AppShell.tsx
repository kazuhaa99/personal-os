import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight, BarChart3, CalendarClock, Check, CheckSquare, ChevronDown, Command, CreditCard, Flame, Landmark, LayoutDashboard, Menu, Monitor,
  Moon, PanelLeftClose, PanelLeftOpen, PiggyBank, Plus, Search, Settings, Sun, Target, X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useAccounts } from "@/lib/queries";
import { useTheme, WALLPAPERS } from "@/lib/theme";
import type { Dashboard } from "@/lib/types";
import { Button, cn } from "@/components/ui/primitives";
import { CommandPalette } from "./CommandPalette";
import { useQuickActions } from "./QuickActions";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; badge?: (d?: Dashboard) => ReactNode };

const PERSONAL: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, badge: (d) => (d ? d.tasks.counts.today + d.tasks.counts.overdue || null : null) },
  { to: "/goals", label: "Goals & Projects", icon: Target, badge: (d) => d?.goals.length || null },
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
  ["/settings", "Settings", "Profile, appearance and data"],
];

// ---------------------------------------------------------------- wallpaper

function Wallpaper() {
  const { wallpaper, resolved } = useTheme();
  const wp = WALLPAPERS.find((w) => w.id === wallpaper) ?? WALLPAPERS[0];
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
          <span className="relative flex-1 truncate">{label}</span>
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
        <div className="h-7 w-7 rounded-[8px] grid place-items-center text-white text-[13px] font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_2px_6px_rgb(10_112_240/0.35)]" style={{ background: "linear-gradient(145deg, #4aa3ff, #0a62e0)" }}>P</div>
        <span className="flex-1 text-[15px] font-semibold tracking-tight">Personal OS</span>
        {onCollapse && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Hide sidebar" onClick={onCollapse}><PanelLeftClose className="h-4 w-4" /></Button>}
      </div>
      <nav className="flex-1 overflow-y-auto space-y-4 pt-1" aria-label="Main">
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-xs font-semibold text-ink-3">Personal</p>
          {PERSONAL.map((i) => <SideLink key={i.to} item={i} data={data} onNavigate={onNavigate} />)}
        </div>
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-xs font-semibold text-ink-3">Money</p>
          {MONEY.map((i) => <SideLink key={i.to} item={i} data={data} onNavigate={onNavigate} />)}
        </div>
        {active.length > 0 && (
          <div>
            <p className="px-2.5 pb-1 text-xs font-semibold text-ink-3">Balances</p>
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
            <b>Demo data loaded</b> — examples, not your finances.
          </Link>
        )}
        <SideLink item={{ to: "/settings", label: "Settings", icon: Settings }} onNavigate={onNavigate} />
      </div>
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
        <Button variant="ghost" size="icon" aria-label="Appearance">{resolved === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={menuContent}>
          {options.map(({ v, label, icon: Icon }) => (
            <DropdownMenu.Item key={v} className={menuItem} onSelect={() => setMode(v)}>
              <Icon className="h-4 w-4" /> <span className="flex-1">{label}</span> {mode === v && <Check className="h-4 w-4" />}
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
        <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Transaction</span>
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="primary" size="sm" className="h-8 rounded-l-none border-l border-white/25 px-1.5" aria-label="More create options"><ChevronDown className="h-4 w-4" /></Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className={menuContent}>
            <DropdownMenu.Item className={menuItem} onSelect={() => qa.newTransaction()}><ArrowLeftRight className="h-4 w-4" /><span className="flex-1">Transaction</span><kbd className="text-xs opacity-70">T</kbd></DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => qa.newTask()}><CheckSquare className="h-4 w-4" /><span className="flex-1">Task</span><kbd className="text-xs opacity-70">N</kbd></DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-line/10" />
            <DropdownMenu.Item className={menuItem} onSelect={() => navigate("/goals?new=1")}><Target className="h-4 w-4" />Goal</DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => navigate("/habits?new=1")}><Flame className="h-4 w-4" />Habit</DropdownMenu.Item>
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
    if (location.pathname === "/") return ["Overview", format(new Date(), "EEEE, d MMMM yyyy")];
    const t = TITLES.find(([p]) => location.pathname.startsWith(p));
    return t ? [t[1], t[2]] : ["Personal OS", ""];
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
          <header className="flex h-14 shrink-0 items-center gap-2 px-3 lg:px-4 border-b hairline bg-surface/50 backdrop-blur-xl">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu className="h-4 w-4" /></Button>
            {collapsed && <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label="Show sidebar" onClick={() => setCollapsed(false)}><PanelLeftOpen className="h-4 w-4" /></Button>}
            <div className="min-w-0 flex-1 pl-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <h1 className="text-[15px] font-semibold leading-5 truncate">{title}</h1>
                  <p className="text-xs text-ink-3 truncate tnum">{subtitle}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <button onClick={() => setPalette(true)} className="field hidden md:flex items-center gap-2 h-8 w-[260px] rounded-lg px-2.5 text-[13px] text-ink-3 hover:bg-fill/[0.07] transition-colors">
              <Search className="h-3.5 w-3.5" /> <span className="flex-1 text-left">Search or run a command</span>
              <kbd className="inline-flex items-center gap-0.5 rounded bg-surface px-1.5 py-0.5 text-[11px] border hairline"><Command className="h-3 w-3" />K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setPalette(true)}><Search className="h-4 w-4" /></Button>
            <ThemeMenu />
            <NewMenu />
          </header>

          <main className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={location.pathname}
                initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-full max-w-[1680px] px-4 py-5 lg:px-6 lg:py-6 pb-28 lg:pb-8">
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
            <motion.aside className="absolute left-2 top-2 bottom-2 w-[272px] rounded-2xl mat-popover overflow-hidden"
              initial={{ x: "-110%" }} animate={{ x: 0 }} exit={{ x: "-110%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
              <Button variant="ghost" size="icon" className="absolute right-2 top-3 z-10" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></Button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile tab bar: floating glass */}
      <nav className="lg:hidden fixed bottom-3 inset-x-3 z-30 grid grid-cols-5 rounded-2xl mat-glass p-1" aria-label="Primary">
        {[PERSONAL[0], PERSONAL[1], { to: "/finances/transactions", label: "Money", icon: ArrowLeftRight }, PERSONAL[3], { to: "/analytics", label: "Analytics", icon: BarChart3 }].map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px]", isActive ? "text-accent bg-fill/[0.06]" : "text-ink-2")}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {label.split(" ")[0]}
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={palette} onOpenChange={setPalette} />
    </>
  );
}
