import { format } from "date-fns";
import { BarChart3, CheckSquare, Flame, LayoutDashboard, Menu, Plus, Settings, Target, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, cn } from "@/components/ui/primitives";
import { useQuickActions } from "./QuickActions";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/goals", label: "Goals & Projects", icon: Target },
  { to: "/habits", label: "Habits", icon: Flame },
  { to: "/finances", label: "Finances", icon: Wallet },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const TITLES: [string, string][] = [
  ["/finances", "Finances"], ["/tasks", "Tasks"], ["/goals", "Goals & Projects"], ["/habits", "Habits"],
  ["/analytics", "Analytics"], ["/settings", "Settings"],
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-sm transition-colors",
            isActive ? "bg-white/[0.07] text-ink" : "text-ink-2 hover:text-ink hover:bg-white/[0.04]",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function DemoBanner() {
  const { data } = useQuery({ queryKey: ["demo"], queryFn: () => api.get<{ loaded: boolean }>("/demo"), staleTime: 30_000 });
  if (!data?.loaded) return null;
  return (
    <div className="mb-4 rounded-lg border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-3.5 py-2 text-xs text-[#d4c8ff]">
      Demo data is loaded. Records marked <b>demo</b> are invented examples, not your information. Remove them in{" "}
      <NavLink to="/settings" className="underline underline-offset-2">Settings</NavLink>.
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const qa = useQuickActions();
  useEffect(() => setMobileOpen(false), [pathname]);
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "Overview";

  return (
    <div className="min-h-full flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r hairline bg-surface/40 px-3 py-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-2.5 mb-6">
          <div className="h-6 w-6 rounded-md bg-accent grid place-items-center text-accent-ink text-xs font-bold">P</div>
          <span className="text-sm font-semibold tracking-tight">Personal OS</span>
        </div>
        <NavItems />
        <div className="mt-auto px-2.5 text-2xs text-ink-3 leading-relaxed">
          Shortcuts: <kbd className="text-ink-2">t</kbd> transaction · <kbd className="text-ink-2">n</kbd> task
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-surface border-r hairline p-3">
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-sm font-semibold">Personal OS</span>
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <NavItems onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-4 lg:px-8 border-b hairline bg-bg/85 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden -ml-1" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{title}</p>
          </div>
          <p className="hidden sm:block text-xs text-ink-3 tnum">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => qa.newTask()} className="h-8"><Plus className="h-3.5 w-3.5" /> Task</Button>
            <Button size="sm" variant="primary" onClick={() => qa.newTransaction()} className="h-8"><Plus className="h-3.5 w-3.5" /> Transaction</Button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 max-w-[1320px] w-full mx-auto pb-24 lg:pb-8">
          <DemoBanner />
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav (primary destinations) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 border-t hairline bg-surface/95 backdrop-blur">
        {NAV.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-2xs", isActive ? "text-ink" : "text-ink-3")}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label.split(" ")[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
