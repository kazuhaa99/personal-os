import { useQuery } from "@tanstack/react-query";
import { addDays, format as isoFormat, parseISO, startOfWeek, subDays } from "date-fns";
import { Archive, Check, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { format, t, tp } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Habit } from "@/lib/types";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Button, Card, cn, DemoBadge, EmptyState, Field, Input, LoadingBlock, Segmented, Textarea } from "@/components/ui/primitives";

/** Localised short weekday names, Monday first (call at render time). */
const weekdayNames = () => Array.from({ length: 7 }, (_, i) => format(new Date(2024, 0, 1 + i), "EEE"));
const COLORS = ["#7c9cff", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee", "#f87171"];

function isScheduled(h: Habit, d: Date) {
  if (isoFormat(d, "yyyy-MM-dd") < h.start_date) return false;
  return h.schedule === "daily" || h.weekdays.includes((d.getDay() + 6) % 7);
}

function HabitForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Habit | null }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState<Habit["schedule"]>("daily");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? ""); setDescription(editing?.description ?? ""); setSchedule(editing?.schedule ?? "daily");
    setWeekdays(editing?.weekdays ?? [0, 1, 2, 3, 4]); setColor(editing?.color ?? COLORS[0]); setError(null);
  }, [open, editing]);
  const save = useAction((body: Record<string, unknown>) => (editing ? api.patch(`/habits/${editing.id}`, body) : api.post("/habits", body)), { success: t("Habit saved"), onSuccess: () => onOpenChange(false) });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editing ? t("Edit habit") : t("New habit")}
      onSubmit={() => {
        if (!name.trim()) return setError(t("Name the habit"));
        if (schedule === "weekdays" && !weekdays.length) return setError(t("Pick at least one day"));
        save.mutate({ name: name.trim(), description: description.trim() || null, schedule, weekdays, color });
      }}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{t("Save")}</Button></>}>
      <Field label={t("Name")} error={error}>{(id) => <Input id={id} autoFocus value={name} maxLength={80} placeholder={t("e.g. Practice guitar 20 min")} onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-2">{t("Schedule")}</p>
        <Segmented value={schedule} onChange={setSchedule} options={[{ value: "daily", label: t("Every day") }, { value: "weekdays", label: t("Specific days") }]} />
        {schedule === "weekdays" && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {weekdayNames().map((d, i) => (
              <button key={d} type="button" aria-pressed={weekdays.includes(i)} onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))}
                className={cn("h-8 w-11 rounded-lg text-xs border", weekdays.includes(i) ? "bg-accent text-accent-ink border-accent" : "hairline text-ink-2 hover:bg-fill/[0.04]")}>{d}</button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-2">{t("Color")}</p>
        <div className="flex gap-2">{COLORS.map((c) => (
          <button key={c} type="button" aria-label={t("Color {value}", { value: c })} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("h-7 w-7 rounded-full", color === c && "ring-2 ring-offset-2 ring-offset-raised ring-ink/50")} style={{ background: c }} />
        ))}</div>
      </div>
      <Field label={t("Notes")}>{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
    </Modal>
  );
}

/** 26-week heatmap. Unscheduled days are blank; scheduled-but-missed are dim. */
function Heatmap({ habit, today }: { habit: Habit; today: string }) {
  const done = useMemo(() => new Set(habit.completions), [habit.completions]);
  const end = parseISO(today);
  const start = startOfWeek(subDays(end, 7 * 25), { weekStartsOn: 1 });
  const weeks: Date[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label={tp("{name}: {n} completions in the last 26 weeks", habit.completions.length, { name: habit.name })}>
      {weeks.map((w, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {w.map((d) => {
            const iso = isoFormat(d, "yyyy-MM-dd");
            const future = d > end;
            const sched = isScheduled(habit, d);
            const isDone = done.has(iso);
            return (
              <div key={iso} title={`${format(d, t("EEE d MMM"))}: ${future ? "" : isDone ? t("done") : sched ? t("missed") : t("not scheduled")}`}
                className={cn("h-[11px] w-[11px] rounded-[3px]", future ? "bg-transparent" : !isDone && sched ? "bg-fill/[0.06]" : !isDone ? "bg-fill/[0.02]" : "")}
                style={isDone ? { background: habit.color } : undefined} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function HabitCard({ habit, today, onEdit }: { habit: Habit; today: string; onEdit: () => void }) {
  const confirm = useConfirm();
  const toggle = useAction(({ date, done }: { date: string; done: boolean }) => api.put(`/habits/${habit.id}/completions`, { date, done }), { haptic: "light" });
  const archive = useAction(() => api.patch(`/habits/${habit.id}`, { is_archived: !habit.is_archived }), { success: habit.is_archived ? t("Habit restored") : t("Habit archived") });
  const del = useAction(() => api.del(`/habits/${habit.id}`), { success: t("Habit deleted") });
  const doneSet = new Set(habit.completions);
  const last7 = Array.from({ length: 7 }, (_, i) => subDays(parseISO(today), 6 - i));

  return (
    <Card className={cn("p-5", habit.is_archived && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate"><span className="inline-block h-2.5 w-2.5 rounded-full mr-2" style={{ background: habit.color }} />{habit.name}<DemoBadge show={habit.is_demo} /></p>
          <p className="text-xs text-ink-3 mt-0.5">{habit.schedule === "daily" ? t("Every day") : habit.weekdays.map((d) => weekdayNames()[d]).join(", ")}</p>
        </div>
        <div className="flex">
          <Button variant="ghost" size="icon" aria-label={t("Edit")} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" aria-label={habit.is_archived ? t("Unarchive") : t("Archive")} onClick={() => archive.mutate(undefined)}><Archive className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" aria-label={t("Delete")} onClick={async () => { if (await confirm({ title: t("Delete “{title}”?", { title: habit.name }), body: t("All completion history is deleted. Archive it to keep the history.") })) del.mutate(undefined); }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5">
        {last7.map((d) => {
          const iso = isoFormat(d, "yyyy-MM-dd");
          const sched = isScheduled(habit, d);
          const isDone = doneSet.has(iso);
          const beforeStart = iso < habit.start_date;
          return (
            <button key={iso} type="button" disabled={beforeStart || toggle.isPending} aria-pressed={isDone} aria-label={isDone ? t("{date}, done", { date: format(d, t("EEEE, d MMM")) }) : format(d, t("EEEE, d MMM"))}
              onClick={() => toggle.mutate({ date: iso, done: !isDone })}
              className={cn("flex-1 rounded-lg border py-1.5 text-center transition-colors disabled:opacity-30", isDone ? "border-transparent" : sched ? "hairline hover:bg-fill/[0.05]" : "border-dashed border-white/10 hover:bg-fill/[0.03]")}
              style={isDone ? { background: `${habit.color}26`, borderColor: `${habit.color}66` } : undefined}>
              <span className="block text-2xs text-ink-3">{format(d, "EEEEE")}</span>
              <span className="mt-0.5 grid place-items-center h-5">{isDone ? <Check className="h-4 w-4" style={{ color: habit.color }} strokeWidth={3} /> : <span className={cn("text-xs tnum", iso === today ? "text-ink" : "text-ink-3")}>{format(d, "d")}</span>}</span>
            </button>
          );
        })}
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          [t("7-day rate"), habit.week_rate ? `${Math.round(Number(habit.week_rate))}%` : "—"],
          [t("30-day rate"), habit.month_rate ? `${Math.round(Number(habit.month_rate))}%` : "—"],
          [t("Streak"), `${habit.current_streak}`],
          [t("Best"), `${habit.longest_streak}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-fill/[0.05] py-2">
            <dd className="text-base font-semibold tnum">{v}</dd>
            <dt className="text-2xs text-ink-3">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-4"><Heatmap habit={habit} today={today} /></div>
      <p className="mt-1 text-2xs text-ink-3">{tp("{n} completions · {rate} of scheduled days since {date}", habit.total_completions, { rate: habit.all_time_rate ? `${habit.all_time_rate}%` : "—", date: format(parseISO(habit.start_date), t("d MMM yyyy")) })}</p>
    </Card>
  );
}

export function HabitsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<{ open: boolean; editing: Habit | null }>({ open: false, editing: null });
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new")) {
      setForm({ open: true, editing: null });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const { data: habits, isLoading } = useQuery({ queryKey: ["habits", showArchived], queryFn: () => api.get<Habit[]>("/habits", { include_archived: showArchived }) });
  const today = todayISO();
  const scheduled = (habits ?? []).filter((h) => !h.is_archived && h.scheduled_today);
  const doneToday = scheduled.filter((h) => h.done_today).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {scheduled.length > 0 && <p className="text-sm text-ink-2"><span className="text-ink font-medium tnum">{doneToday}/{scheduled.length}</span> {t("done today")}</p>}
          <p className="text-xs text-ink-3">{t("Consistency matters more than perfect streaks — rates show the bigger picture.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented size="sm" value={showArchived ? "all" : "active"} onChange={(v) => setShowArchived(v === "all")} options={[{ value: "active", label: t("Active") }, { value: "all", label: t("Include archived") }]} />
          <Button variant="primary" onClick={() => setForm({ open: true, editing: null })}><Plus className="h-4 w-4" /> {t("New habit")}</Button>
        </div>
      </div>
      {isLoading ? <LoadingBlock /> : !habits?.length ? (
        <Card><EmptyState icon={<Flame className="h-6 w-6" />} title={t("No habits yet")} body={t("Reading, practicing guitar, exercising, a consistent bedtime — start with one or two.")} action={<Button variant="primary" onClick={() => setForm({ open: true, editing: null })}>{t("Create a habit")}</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {habits.map((h) => <HabitCard key={h.id} habit={h} today={today} onEdit={() => setForm({ open: true, editing: h })} />)}
        </div>
      )}
      <HabitForm open={form.open} editing={form.editing} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
    </div>
  );
}
