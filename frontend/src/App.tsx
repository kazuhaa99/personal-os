import { lazy, Suspense, type ComponentType } from "react";
import { Spinner } from "./components/ui/primitives";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { QuickActionsProvider } from "./components/layout/QuickActions";
import { AuthGate } from "./features/auth/AuthGate";
import { FinanceLayout } from "./features/finance/FinanceLayout";
import { OverviewPage } from "./features/overview/OverviewPage";

// Every page but the overview loads on first visit, so the first screen downloads only what it shows.
function page(load: () => Promise<ComponentType>) {
  const Lazy = lazy(() => load().then((component) => ({ default: component })));
  return function Page() {
    return <Suspense fallback={<div className="grid place-items-center py-24"><Spinner /></div>}><Lazy /></Suspense>;
  };
}
const AnalyticsPage = page(() => import("./features/analytics/AnalyticsPage").then((m) => m.AnalyticsPage));
const AccountsPage = page(() => import("./features/finance/AccountsPage").then((m) => m.AccountsPage));
const BudgetsPage = page(() => import("./features/finance/BudgetsPage").then((m) => m.BudgetsPage));
const InstallmentsPage = page(() => import("./features/finance/InstallmentsPage").then((m) => m.InstallmentsPage));
const RecurringPage = page(() => import("./features/finance/RecurringPage").then((m) => m.RecurringPage));
const TransactionsPage = page(() => import("./features/finance/TransactionsPage").then((m) => m.TransactionsPage));
const GoalsPage = page(() => import("./features/goals/GoalsPage").then((m) => m.GoalsPage));
const HabitsPage = page(() => import("./features/habits/HabitsPage").then((m) => m.HabitsPage));
const ProfilePage = page(() => import("./features/profile/ProfilePage").then((m) => m.ProfilePage));
const SettingsPage = page(() => import("./features/settings/SettingsPage").then((m) => m.SettingsPage));
const TasksPage = page(() => import("./features/tasks/TasksPage").then((m) => m.TasksPage));

// Isolated design exploration (no API calls, sample data only). Lazy so it never weighs on the real app.
const DesignLab = lazy(() => import("./design-lab/DesignLab"));

export function App() {
  return (
    <Routes>
      <Route path="design-lab/*" element={<Suspense fallback={null}><DesignLab /></Suspense>} />
      <Route element={<AuthGate><QuickActionsProvider><AppShell /></QuickActionsProvider></AuthGate>}>
        <Route index element={<OverviewPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="finances" element={<FinanceLayout />}>
          <Route index element={<Navigate to="transactions" replace />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="installments" element={<InstallmentsPage />} />
        </Route>
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
