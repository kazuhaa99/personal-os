// API types. Money is always a decimal *string* ("1234.50"); never do arithmetic
// on it in the browser — totals come from the backend.
export type Money = string;
export type ISODate = string;

export type AccountType = "cash" | "bank" | "savings" | "other";
export type TxType = "income" | "expense" | "transfer";
export type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: Money;
  opening_date: ISODate;
  current_balance: Money;
  is_archived: boolean;
  notes: string | null;
  is_demo: boolean;
  transaction_count: number;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  kind: "income" | "expense";
  color: string;
  is_archived: boolean;
  is_system: boolean;
}

export interface Ref { id: number; name: string; currency?: string; color?: string }

export interface Transaction {
  id: number;
  type: TxType;
  amount: Money;
  currency: string;
  date: ISODate;
  account: Ref;
  to_account: Ref | null;
  category: Ref | null;
  description: string;
  payee: string | null;
  tags: string[];
  recurring_rule_id: number | null;
  installment_payment_id: number | null;
  is_demo: boolean;
  created_at: string;
}

export interface TxTotals { currency: string; income: Money; expense: Money; net: Money; transfers: Money }
export interface TxPage { items: Transaction[]; total: number; limit: number; offset: number; totals: TxTotals[] }

export interface BudgetLine {
  category_id: number;
  category_name: string;
  color: string;
  limit: Money;
  spent: Money;
  remaining: Money;
  utilization: string | null;
  status: "ok" | "warning" | "over";
  effective_since: string;
  previous_month_spent: Money;
  average_3m_spent: Money | null;
}
export interface BudgetMonth {
  month: string;
  currency: string;
  lines: BudgetLine[];
  total_limit: Money;
  total_spent_budgeted: Money;
  unbudgeted_spent: Money;
  note: string;
}

export interface RecurringRule {
  id: number;
  name: string;
  type: "income" | "expense";
  amount: Money;
  currency: string;
  frequency: Frequency;
  start_date: ISODate;
  next_due_date: ISODate | null;
  end_date: ISODate | null;
  account: Ref;
  category: Ref;
  payee: string | null;
  is_active: boolean;
  is_demo: boolean;
  monthly_equivalent: Money;
  confirmed_count: number;
}

export interface ExpectedPayment {
  kind: "recurring" | "installment";
  source_id: number;
  name: string;
  type: "income" | "expense";
  amount: Money;
  currency: string;
  due_date: ISODate;
  overdue: boolean;
  account_name: string | null;
}

export interface InstallmentPayment { id: number; date: ISODate; amount: Money; transaction_id: number | null; note: string | null }
export interface InstallmentPlan {
  id: number;
  name: string;
  lender: string | null;
  currency: string;
  original_amount: Money;
  starting_outstanding: Money;
  paid_amount: Money;
  outstanding: Money;
  progress: string | null;
  payment_amount: Money;
  frequency: Frequency;
  next_payment_date: ISODate | null;
  final_payment_date: ISODate | null;
  status: "active" | "paused" | "paid_off" | "cancelled";
  default_account_id: number | null;
  notes: string | null;
  is_demo: boolean;
  payments: InstallmentPayment[];
  remaining_payments_estimate: number | null;
  estimated_payoff_date: ISODate | null;
  estimate_note: string;
}

export type Priority = "low" | "medium" | "high" | "urgent";
export interface Task {
  id: number;
  title: string;
  description: string | null;
  due_date: ISODate | null;
  due_time: string | null;
  priority: Priority;
  status: "todo" | "in_progress" | "done";
  category: string | null;
  goal_id: number | null;
  project_id: number | null;
  recurrence: "none" | "daily" | "weekdays" | "weekly" | "monthly";
  completed_at: string | null;
  is_demo: boolean;
  created_at: string;
  overdue: boolean;
}

export interface Milestone { id: number; title: string; due_date: ISODate | null; completed_at: string | null; position: number }
export interface Goal {
  id: number;
  title: string;
  description: string | null;
  category: string;
  target_date: ISODate | null;
  status: "active" | "paused" | "completed";
  progress_mode: "manual" | "milestones" | "target";
  progress: number;
  manual_progress: number;
  target_value: string | null;
  current_value: string;
  unit: string | null;
  archived: boolean;
  overdue: boolean;
  days_left: number | null;
  last_progress_at: string | null;
  milestones: Milestone[];
  projects: { id: number; title: string; status: string }[];
  open_tasks: number;
  done_tasks: number;
  history: { recorded_at: string; progress: number; note: string | null }[];
  is_demo: boolean;
  created_at: string;
}
export interface Project {
  id: number;
  title: string;
  description: string | null;
  goal_id: number | null;
  goal_title: string | null;
  status: "active" | "on_hold" | "completed";
  target_date: ISODate | null;
  open_tasks: number;
  done_tasks: number;
  progress: number | null;
  is_demo: boolean;
}

export interface Habit {
  id: number;
  name: string;
  description: string | null;
  schedule: "daily" | "weekdays";
  weekdays: number[];
  color: string;
  start_date: ISODate;
  is_archived: boolean;
  is_demo: boolean;
  scheduled_today: boolean;
  done_today: boolean;
  current_streak: number;
  longest_streak: number;
  week_rate: string | null;
  month_rate: string | null;
  all_time_rate: string | null;
  total_completions: number;
  completions: ISODate[];
}

export interface Insight {
  key: string;
  severity: "critical" | "warning" | "info";
  category: "finance" | "tasks" | "goals";
  title: string;
  explanation: string;
  link: string | null;
  estimate: boolean;
  dismissed: boolean;
}

export interface Settings { owner_name: string; primary_currency: string; timezone: string; week_starts_on: number }

export interface ImportIssue { row: number; reason: string; raw: Record<string, string> }
export interface ImportReport { dry_run: boolean; total_rows: number; imported: number; rejected: ImportIssue[]; duplicates: ImportIssue[] }

export interface Dashboard {
  today: ISODate;
  owner_name: string;
  primary_currency: string;
  tasks: { today: Task[]; upcoming: Task[]; counts: { today: number; overdue: number; upcoming_7d: number; done_today: number } };
  habits: { items: Habit[]; scheduled_today: number; done_today: number };
  goals: Goal[];
  accounts: { items: Account[]; totals: { currency: string; amount: Money }[] };
  month: { label: string; start: ISODate; end: ISODate; currency: string; income: Money; expense: Money; net_cash_flow: Money };
  budget: { total_limit: Money; total_spent: Money; utilization: string | null; lines: BudgetLine[]; currency: string };
  expected_payments: { items: ExpectedPayment[]; total_expected_outflow_30d: Money; note: string };
  liabilities: { currency: string; amount: Money }[];
  insights: Insight[];
}

export interface AnalyticsSummary {
  range: { start: string; end: string };
  currency: string;
  cash_flow: {
    months: { month: string; income: Money; expense: Money; net_cash_flow: Money; savings_rate: string | null; has_data: boolean }[];
    total_income: Money;
    total_expense: Money;
    net_cash_flow: Money;
    months_with_data: number;
    average_monthly_expense: Money | null;
  };
  categories: { total: Money; categories: { category_id: number; name: string; color: string; amount: Money; count: number; share: string | null }[] };
  income_categories: { total: Money; categories: { category_id: number; name: string; color: string; amount: Money; count: number; share: string | null }[] };
  trend: { series: { key: string; name: string; color: string }[]; months: Record<string, string>[] };
  balances: { points: { month: string; as_of: ISODate; total_balance: Money; savings_balance: Money }[] };
  budget_performance: { months: { month: string; limit: Money | null; spent: Money | null; over_count: number }[] };
  liabilities: { currency: string; amount: Money }[];
}
