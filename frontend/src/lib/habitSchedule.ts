import { parseISO } from "date-fns";
import type { Habit } from "./types";

/** Whether the habit is due on `day` (ISO date): the server's rule (services/habits.py is_scheduled). */
export function isScheduled(habit: Pick<Habit, "schedule" | "weekdays" | "start_date">, day: string): boolean {
  if (day < habit.start_date) return false;
  if (habit.schedule === "daily") return true;
  const monday0 = (parseISO(day).getDay() + 6) % 7; // JS: 0 = Sunday; the API: 0 = Monday
  return habit.weekdays.includes(monday0);
}
