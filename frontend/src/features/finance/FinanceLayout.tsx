import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/components/ui/primitives";

const TABS = [
  { to: "transactions", label: "Transactions" },
  { to: "accounts", label: "Accounts" },
  { to: "budgets", label: "Budgets" },
  { to: "recurring", label: "Recurring" },
  { to: "installments", label: "Installments" },
];

export function FinanceLayout() {
  return (
    <div>
      <nav className="-mt-2 mb-6 flex gap-1 overflow-x-auto border-b hairline" aria-label="Finance sections">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => cn(
              "px-3 h-10 inline-flex items-center text-sm border-b-2 -mb-px whitespace-nowrap transition-colors",
              isActive ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
