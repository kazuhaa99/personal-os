import type { Dict } from "../../i18n";

// English is the source language: only plural forms live here.
export const planning: Dict = {
  "Delete {n} completed task?": { one: "Delete {n} completed task?", other: "Delete {n} completed tasks?" },
  "{n} days left": { one: "{n} day left", other: "{n} days left" },
  "{done}/{n} tasks": { one: "{done}/{n} task", other: "{done}/{n} tasks" },
  "{name}: {n} completions in the last 26 weeks": { one: "{name}: {n} completion in the last 26 weeks", other: "{name}: {n} completions in the last 26 weeks" },
  "{n} completions · {rate} of scheduled days since {date}": { one: "{n} completion · {rate} of scheduled days since {date}", other: "{n} completions · {rate} of scheduled days since {date}" },
};
