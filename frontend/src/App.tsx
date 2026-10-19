import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { QuickActionsProvider } from "./components/layout/QuickActions";
import { AuthGate } from "./features/auth/AuthGate";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { AccountsPage } from "./features/finance/AccountsPage";
import { BudgetsPage } from "./features/finance/BudgetsPage";
import { FinanceLayout } from "./features/finance/FinanceLayout";
import { InstallmentsPage } from "./features/finance/InstallmentsPage";
import { RecurringPage } from "./features/finance/RecurringPage";
import { TransactionsPage } from "./features/finance/TransactionsPage";
import { GoalsPage } from "./features/goals/GoalsPage";
import { HabitsPage } from "./features/habits/HabitsPage";
import { OverviewPage } from "./features/overview/OverviewPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TasksPage } from "./features/tasks/TasksPage";

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
