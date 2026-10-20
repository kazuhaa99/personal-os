import { asset } from "@/lib/base";
// Shared, clearly-labelled SAMPLE data for the design lab.
// Identical across all four concepts so the comparison is about design, not content.
// None of this touches the real API or database.

export const DEMO_LABEL = "Demo data";
export const TODAY = "2026-10-19"; // fixed so every concept renders the same day
export const CURRENCY = "KZT";

export type Screen = "dashboard" | "finance" | "transactions" | "goals" | "tasks";
export const SCREENS: { id: Screen; label: string }[] = [
  { id: "dashboard", label: "Today" },
  { id: "finance", label: "Money" },
  { id: "transactions", label: "Transactions" },
  { id: "goals", label: "Goals" },
  { id: "tasks", label: "Tasks" },
];

export type ImageKey = "peaks" | "moraine" | "ocean" | "pier" | "maple" | "city" | "gears" | "walker" | "arches" | "stairs" | "earth" | "bridge";

export const IMAGES: Record<ImageKey, { src: string; color: string; w: number; h: number }> = {
  peaks: { src: asset("/media/peaks.jpg"), color: "#50747a", w: 2400, h: 1629 },
  moraine: { src: asset("/media/moraine.jpg"), color: "#527f93", w: 1600, h: 1146 },
  ocean: { src: asset("/media/ocean.jpg"), color: "#93abb9", w: 1920, h: 1280 },
  pier: { src: asset("/media/pier.jpg"), color: "#a3b4bd", w: 640, h: 427 },
  maple: { src: asset("/media/maple.jpg"), color: "#575140", w: 640, h: 427 },
  city: { src: asset("/media/city.jpg"), color: "#7a6b60", w: 640, h: 427 },
  gears: { src: asset("/media/gears.jpg"), color: "#747980", w: 1280, h: 834 },
  walker: { src: asset("/media/walker.jpg"), color: "#f1eff0", w: 2000, h: 1000 },
  arches: { src: asset("/media/arches.jpg"), color: "#e0ddde", w: 1600, h: 800 },
  stairs: { src: asset("/media/stairs.jpg"), color: "#dbdbdb", w: 1600, h: 800 },
  earth: { src: asset("/media/earth.jpg"), color: "#0f0f1e", w: 2048, h: 1024 },
  bridge: { src: asset("/media/bridge.jpg"), color: "#5e6c72", w: 1024, h: 1024 },
};

export interface Account { id: string; name: string; kind: string; balance: string; trend: number[] }
export const ACCOUNTS: Account[] = [
  { id: "main", name: "Kaspi Gold", kind: "Card", balance: "1406550.00", trend: [1.21, 1.18, 1.3, 1.26, 1.35, 1.32, 1.41] },
  { id: "savings", name: "Savings deposit", kind: "Savings", balance: "1000000.00", trend: [0.5, 0.6, 0.7, 0.8, 0.9, 0.9, 1.0] },
  { id: "cash", name: "Cash", kind: "Cash", balance: "32200.00", trend: [0.06, 0.05, 0.04, 0.05, 0.04, 0.03, 0.032] },
];
export const TOTAL_BALANCE = "2438750.00";

export const MONTH = {
  label: "October 2026",
  income: "650000.00",
  expense: "340890.00",
  net: "309110.00",
  budgetLimit: "530000.00",
  budgetSpent: "340890.00",
  budgetPct: 64,
  daysLeft: 12,
};

export const LIABILITIES = { outstanding: "280000.00", original: "480000.00", name: "Laptop 0-0-12" };

/** Six months of income/expense (thousands, chart geometry only — labels use exact strings). */
export const CASHFLOW = [
  { month: "May", income: 650, expense: 412, incomeS: "650000.00", expenseS: "412300.00" },
  { month: "Jun", income: 790, expense: 388, incomeS: "790000.00", expenseS: "388150.00" },
  { month: "Jul", income: 650, expense: 451, incomeS: "650000.00", expenseS: "451400.00" },
  { month: "Aug", income: 735, expense: 427, incomeS: "735000.00", expenseS: "427200.00" },
  { month: "Sep", income: 650, expense: 330, incomeS: "650000.00", expenseS: "330390.00" },
  { month: "Oct", income: 650, expense: 341, incomeS: "650000.00", expenseS: "340890.00" },
];

export const SPENDING = [
  { name: "Housing", amount: "180000.00", value: 180, pct: 53, color: "#7c9cff" },
  { name: "Groceries", amount: "87300.00", value: 87, pct: 26, color: "#f2a65a" },
  { name: "Restaurants", amount: "26500.00", value: 27, pct: 8, color: "#e58fb4" },
  { name: "Shopping", amount: "21900.00", value: 22, pct: 6, color: "#5ec4a8" },
  { name: "Transport", amount: "14200.00", value: 14, pct: 4, color: "#9b8cf2" },
  { name: "Subscriptions", amount: "10990.00", value: 11, pct: 3, color: "#c9c47a" },
];

export type TxType = "income" | "expense" | "transfer";
export interface Tx { id: string; date: string; title: string; category: string; account: string; amount: string; type: TxType; note?: string; session?: boolean }
export const TRANSACTIONS: Tx[] = [
  { id: "t1", date: "2026-10-19", title: "Magnum Supermarket", category: "Groceries", account: "Kaspi Gold", amount: "4800.00", type: "expense" },
  { id: "t2", date: "2026-10-18", title: "Yandex Go", category: "Transport", account: "Kaspi Gold", amount: "1300.00", type: "expense" },
  { id: "t3", date: "2026-10-18", title: "Coffee Boom", category: "Restaurants", account: "Cash", amount: "2600.00", type: "expense" },
  { id: "t4", date: "2026-10-17", title: "Small Market", category: "Groceries", account: "Kaspi Gold", amount: "6300.00", type: "expense" },
  { id: "t5", date: "2026-10-15", title: "Laptop installment", category: "Installments", account: "Kaspi Gold", amount: "40000.00", type: "expense", note: "Payment 7 of 12" },
  { id: "t6", date: "2026-10-12", title: "Spotify", category: "Subscriptions", account: "Kaspi Gold", amount: "1990.00", type: "expense", note: "Recurring · monthly" },
  { id: "t7", date: "2026-10-12", title: "Meloman", category: "Shopping", account: "Kaspi Gold", amount: "11300.00", type: "expense" },
  { id: "t8", date: "2026-10-10", title: "Dodo Pizza", category: "Restaurants", account: "Kaspi Gold", amount: "7400.00", type: "expense" },
  { id: "t9", date: "2026-10-06", title: "Rent — October", category: "Housing", account: "Kaspi Gold", amount: "180000.00", type: "expense", note: "Recurring · monthly" },
  { id: "t10", date: "2026-10-06", title: "Monthly savings", category: "Transfer", account: "Kaspi Gold → Savings", amount: "100000.00", type: "transfer", note: "Not counted as an expense" },
  { id: "t11", date: "2026-10-05", title: "Salary", category: "Salary", account: "Kaspi Gold", amount: "650000.00", type: "income" },
  { id: "t12", date: "2026-10-03", title: "Arbuz.kz", category: "Groceries", account: "Kaspi Gold", amount: "11800.00", type: "expense" },
];
export const CATEGORIES = ["Groceries", "Restaurants", "Transport", "Shopping", "Housing", "Subscriptions", "Health", "Education", "Salary", "Freelance"];
export const INCOME_CATEGORIES = new Set(["Salary", "Freelance"]);

export interface Payment { id: string; name: string; amount: string; due: string; when: string; kind: "Recurring" | "Installment"; icon: string }
export const UPCOMING: Payment[] = [
  { id: "p1", name: "Gym membership", amount: "15000.00", due: "2026-10-22", when: "Thu", kind: "Recurring", icon: "dumbbell" },
  { id: "p2", name: "Internet", amount: "7990.00", due: "2026-10-25", when: "Sun", kind: "Recurring", icon: "wifi" },
  { id: "p3", name: "Rent — November", amount: "180000.00", due: "2026-11-06", when: "Nov 6", kind: "Recurring", icon: "home" },
  { id: "p4", name: "Spotify", amount: "1990.00", due: "2026-11-12", when: "Nov 12", kind: "Recurring", icon: "music" },
  { id: "p5", name: "Laptop 0-0-12", amount: "40000.00", due: "2026-11-15", when: "Nov 15", kind: "Installment", icon: "laptop" },
];
export const UPCOMING_TOTAL = "244980.00";

export type Priority = "urgent" | "high" | "medium" | "low";
export interface Task { id: string; title: string; time?: string; priority: Priority; project?: string; done: boolean; overdue?: boolean; when: "today" | "upcoming" }
export const TASKS: Task[] = [
  { id: "k1", title: "Pay utilities", priority: "urgent", project: "Home", done: false, overdue: true, when: "today" },
  { id: "k2", title: "Review October budget", time: "10:00", priority: "high", project: "Money", done: false, when: "today" },
  { id: "k3", title: "Practice F-major barre chord", time: "19:30", priority: "medium", project: "Guitar", done: false, when: "today" },
  { id: "k4", title: "Finish module 4 of the course", priority: "high", project: "Career", done: true, when: "today" },
  { id: "k5", title: "Transfer 100 000 ₸ to emergency fund", priority: "high", project: "Money", done: false, when: "upcoming" },
  { id: "k6", title: "Book dentist appointment", priority: "low", project: "Health", done: false, when: "upcoming" },
  { id: "k7", title: "Plan next week", priority: "medium", done: false, when: "upcoming" },
];

export interface Goal { id: string; title: string; category: string; image: ImageKey; progress: number; detail: string; target: string; due: string; milestones: { title: string; done: boolean }[] }
export const GOALS: Goal[] = [
  { id: "g1", title: "Six-month emergency fund", category: "Financial independence", image: "ocean", progress: 50, detail: "1 000 000 of 2 000 000 ₸", target: "2000000.00", due: "Jun 2027", milestones: [{ title: "First 500 000", done: true }, { title: "1 000 000 saved", done: true }, { title: "1 500 000", done: false }, { title: "Full fund", done: false }] },
  { id: "g2", title: "Hike Moraine Lake", category: "Health & adventure", image: "moraine", progress: 35, detail: "Trip fund + training plan", target: "900000.00", due: "Aug 2027", milestones: [{ title: "Book flights", done: false }, { title: "10 km weekend hikes", done: true }, { title: "Trip fund 900 000", done: false }] },
  { id: "g3", title: "Senior engineer by 2027", category: "Career & education", image: "city", progress: 62, detail: "Course · portfolio · interviews", target: "", due: "Dec 2027", milestones: [{ title: "Finish course", done: true }, { title: "Ship portfolio project", done: true }, { title: "Mock interviews", done: false }] },
  { id: "g4", title: "Walk 1 000 km this year", category: "Personal", image: "walker", progress: 71, detail: "712 of 1 000 km", target: "", due: "Dec 2026", milestones: [{ title: "250 km", done: true }, { title: "500 km", done: true }, { title: "750 km", done: false }] },
];

export interface Habit { id: string; name: string; color: string; week: boolean[]; streak: number; rate: number }
// week = Tue..Mon (last 7 days, today last)
export const HABITS: Habit[] = [
  { id: "h1", name: "Read 20 min", color: "#7c9cff", week: [true, true, true, false, true, true, false], streak: 2, rate: 86 },
  { id: "h2", name: "Guitar practice", color: "#f2a65a", week: [false, true, true, true, true, false, false], streak: 0, rate: 63 },
  { id: "h3", name: "Workout", color: "#5ec4a8", week: [false, true, false, true, false, false, false], streak: 1, rate: 54 },
  { id: "h4", name: "Sleep by 23:30", color: "#c49bf2", week: [true, false, true, true, false, true, false], streak: 0, rate: 47 },
];
export const WEEK_LABELS = ["T", "W", "T", "F", "S", "S", "M"];
