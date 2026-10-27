import { useQuery } from "@tanstack/react-query";
import { Archive, Check, FolderKanban, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { goalArt } from "@/lib/goalArt";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtDate, todayISO } from "@/lib/format";
import { t, tp } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Goal, Project, Task } from "@/lib/types";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Badge, Button, Card, CardHeader, cn, DemoBadge, EmptyState, Field, Input, LoadingBlock, Progress, Segmented, Select, Textarea } from "@/components/ui/primitives";
import { useQuickActions } from "@/components/layout/QuickActions";
import { TaskRow } from "@/features/tasks/TaskRow";

const CATEGORIES: Record<string, string> = {
  career: "Career & education", finance: "Financial independence", health: "Health & fitness",
  creative: "Music & creative", personal: "Personal development", other: "Other",
};
const STATUS: Record<string, string> = { active: "Active", paused: "Paused", completed: "Completed", on_hold: "On hold" };
const category = (c: string) => t(CATEGORIES[c] ?? c);
const status = (s: string) => t(STATUS[s] ?? s);

function GoalForm({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Goal | null }) {
  const [f, setF] = useState({ title: "", description: "", category: "personal", target_date: "", progress_mode: "manual" as Goal["progress_mode"], manual_progress: "0", target_value: "", current_value: "0", unit: "", milestones: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      title: editing?.title ?? "", description: editing?.description ?? "", category: editing?.category ?? "personal",
      target_date: editing?.target_date ?? "", progress_mode: editing?.progress_mode ?? "manual",
      manual_progress: String(editing?.manual_progress ?? 0), target_value: editing?.target_value ?? "",
      current_value: editing?.current_value ?? "0", unit: editing?.unit ?? "", milestones: "",
    });
  }, [open, editing]);
  const save = useAction((body: Record<string, unknown>) => (editing ? api.patch(`/goals/${editing.id}`, body) : api.post("/goals", body)), { refresh: ["goals"],
    success: editing ? t("Goal updated") : t("Goal created"), onSuccess: () => onOpenChange(false),
  });

  function submit() {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = t("Give the goal a title");
    const mp = Number(f.manual_progress);
    if (f.progress_mode === "manual" && (!Number.isInteger(mp) || mp < 0 || mp > 100)) e.manual = "0–100";
    if (f.progress_mode === "target" && !/^\d+(\.\d{1,2})?$/.test(f.target_value) ) e.target = t("Enter the target number");
    if (f.progress_mode === "target" && !/^\d+(\.\d{1,2})?$/.test(f.current_value)) e.current = t("Enter a number");
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: Record<string, unknown> = {
      title: f.title.trim(), description: f.description.trim() || null, category: f.category, target_date: f.target_date || null,
      progress_mode: f.progress_mode, manual_progress: mp, unit: f.unit.trim() || null,
      ...(f.progress_mode === "target" ? { target_value: f.target_value, current_value: f.current_value } : {}),
    };
    if (!editing) body.milestones = f.milestones.split("\n").map((t) => t.trim()).filter(Boolean).map((title) => ({ title }));
    save.mutate(body);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} wide title={editing ? t("Edit goal") : t("New goal")} onSubmit={submit}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{t("Save")}</Button></>}>
      <Field label={t("Title")} error={errors.title}>{(id) => <Input id={id} autoFocus value={f.title} maxLength={120} placeholder={t("e.g. Build a 6-month emergency fund")} onChange={set("title")} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Category")}>{(id) => <Select id={id} value={f.category} onChange={set("category")}>{Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</Select>}</Field>
        <Field label={t("Target date (optional)")}>{(id) => <Input id={id} type="date" value={f.target_date} onChange={set("target_date")} />}</Field>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-2">{t("How is progress measured?")}</p>
        <Segmented value={f.progress_mode} onChange={(v) => setF((s) => ({ ...s, progress_mode: v }))} options={[
          { value: "manual", label: t("I'll update it") }, { value: "milestones", label: t("Milestones") }, { value: "target", label: t("A number") },
        ]} />
      </div>
      {f.progress_mode === "manual" && (
        <Field label={t("Current progress (%)")} error={errors.manual}>{(id) => <Input id={id} type="number" min={0} max={100} value={f.manual_progress} onChange={set("manual_progress")} />}</Field>
      )}
      {f.progress_mode === "target" && (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("Current value")} error={errors.current}>{(id) => <Input id={id} inputMode="decimal" value={f.current_value} onChange={set("current_value")} />}</Field>
          <Field label={t("Target value")} error={errors.target}>{(id) => <Input id={id} inputMode="decimal" value={f.target_value} onChange={set("target_value")} />}</Field>
          <Field label={t("Unit")}>{(id) => <Input id={id} value={f.unit} maxLength={20} placeholder={t("KZT, km, books…")} onChange={set("unit")} />}</Field>
        </div>
      )}
      {f.progress_mode === "milestones" && !editing && (
        <Field label={t("Milestones (one per line)")} hint={t("You can add or edit milestones later.")}>{(id) => <Textarea id={id} value={f.milestones} placeholder={t("Learn 5 chords\nPlay first song")} onChange={set("milestones")} />}</Field>
      )}
      <Field label={t("Why does this matter? (optional)")}>{(id) => <Textarea id={id} value={f.description} onChange={set("description")} />}</Field>
    </Modal>
  );
}

function ProjectForm({ open, onOpenChange, goalId, editing }: { open: boolean; onOpenChange: (o: boolean) => void; goalId: number | null; editing: Project | null }) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Project["status"]>("active");
  const [target, setTarget] = useState("");
  useEffect(() => { if (open) { setTitle(editing?.title ?? ""); setStatus(editing?.status ?? "active"); setTarget(editing?.target_date ?? ""); } }, [open, editing]);
  const save = useAction((body: Record<string, unknown>) => (editing ? api.patch(`/projects/${editing.id}`, body) : api.post("/projects", body)), { refresh: ["goals"], success: t("Project saved"), onSuccess: () => onOpenChange(false) });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editing ? t("Edit project") : t("New project")}
      onSubmit={() => title.trim() && save.mutate({ title: title.trim(), status, target_date: target || null, ...(editing ? {} : { goal_id: goalId }) })}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" disabled={!title.trim()} loading={save.isPending}>{t("Save")}</Button></>}>
      <Field label={t("Title")}>{(id) => <Input id={id} autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Status")}>{(id) => <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}><option value="active">{t("Active")}</option><option value="on_hold">{t("On hold")}</option><option value="completed">{t("Completed")}</option></Select>}</Field>
        <Field label={t("Target date")}>{(id) => <Input id={id} type="date" value={target} onChange={(e) => setTarget(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function GoalDetail({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const confirm = useConfirm();
  const qa = useQuickActions();
  const [milestone, setMilestone] = useState("");
  const [progress, setProgress] = useState(String(goal.manual_progress));
  const [value, setValue] = useState(goal.current_value);
  const [project, setProject] = useState<{ open: boolean; editing: Project | null }>({ open: false, editing: null });
  useEffect(() => { setProgress(String(goal.manual_progress)); setValue(goal.current_value); }, [goal.id, goal.manual_progress, goal.current_value]);

  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", "goal", goal.id], queryFn: () => api.get<Task[]>("/tasks", { goal_id: goal.id }) });
  const { data: projects = [] } = useQuery({ queryKey: ["projects", goal.id], queryFn: () => api.get<Project[]>("/projects", { goal_id: goal.id }) });
  const patch = useAction((body: Record<string, unknown>) => api.patch(`/goals/${goal.id}`, body), { refresh: ["goals"], success: t("Goal updated") });
  const addMs = useAction((title: string) => api.post(`/goals/${goal.id}/milestones`, { title }), { refresh: ["goals"], onSuccess: () => setMilestone("") });
  const toggleMs = useAction(({ id, completed }: { id: number; completed: boolean }) => api.patch(`/goals/${goal.id}/milestones/${id}`, { completed }), { refresh: ["goals"] });
  const delMs = useAction((id: number) => api.del(`/goals/${goal.id}/milestones/${id}`), { refresh: ["goals"] });
  const del = useAction(() => api.del(`/goals/${goal.id}`), { refresh: ["goals"], success: t("Goal deleted") });
  const delProject = useAction((id: number) => api.del(`/projects/${id}`), { refresh: ["goals"], success: t("Project deleted") });
  const today = todayISO();

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="relative h-40 sm:h-48">
          <img src={goalArt(goal.category)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
          <span className="absolute left-5 bottom-3 rounded-full bg-black/35 backdrop-blur-md px-2.5 py-1 text-xs font-medium text-white">{category(goal.category)}</span>
        </div>
        <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-3">{category(goal.category)}{goal.target_date && ` · ${t("target {date}", { date: fmtDate(goal.target_date) })}`}</p>
            <h2 className="text-lg font-semibold mt-1">{goal.title}<DemoBadge show={goal.is_demo} /></h2>
            {goal.description && <p className="text-sm text-ink-2 mt-1.5 max-w-prose">{goal.description}</p>}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> {t("Edit")}</Button>
            {goal.status !== "completed" && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ status: "completed" })}><Check className="h-3.5 w-3.5" /> {t("Complete")}</Button>}
            <Button size="sm" variant="ghost" onClick={() => patch.mutate({ archived: !goal.archived })}><Archive className="h-3.5 w-3.5" /> {goal.archived ? t("Unarchive") : t("Archive")}</Button>
            <Button size="sm" variant="ghost" aria-label={t("Delete goal")} onClick={async () => { if (await confirm({ title: t("Delete “{title}”?", { title: goal.title }), body: t("Milestones are deleted. Linked tasks and projects are kept but unlinked.") })) del.mutate(undefined); }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        <div className="mt-5 flex items-end gap-6">
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-3xl font-semibold tnum">{goal.progress}%</span>
              <span className="text-xs text-ink-3">{goal.status !== "active" ? <Badge>{status(goal.status)}</Badge> : goal.overdue ? <span className="text-bad">{t("past target date")}</span> : goal.days_left !== null ? tp("{n} days left", goal.days_left) : ""}</span>
            </div>
            <Progress value={goal.progress} tone={goal.status === "completed" ? "good" : goal.overdue ? "warn" : "accent"} label={t("Goal progress")} />
          </div>
          {goal.history.length >= 2 && (
            <div className="w-40 h-12 hidden sm:block" aria-label={t("Progress history")}>
              <ResponsiveContainer>
                <LineChart data={goal.history.map((h) => ({ d: h.recorded_at.slice(0, 10), p: h.progress }))}>
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip contentStyle={{ background: "rgb(var(--raised))", border: "0.5px solid rgb(var(--line) / 0.15)", borderRadius: 8, fontSize: 12, color: "rgb(var(--ink))" }} labelStyle={{ color: "#a0a0aa" }} formatter={(v) => [`${v}%`, t("progress")]} labelFormatter={(l) => fmtDate(String(l))} />
                  <Line isAnimationActive={false} type="stepAfter" dataKey="p" stroke="var(--series-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        {goal.progress_mode === "manual" && (
          <form className="mt-4 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); patch.mutate({ manual_progress: Math.max(0, Math.min(100, Number(progress) || 0)) }); }}>
            <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(e.target.value)} className="flex-1 accent-[rgb(var(--accent))]" aria-label={t("Progress")} />
            <span className="w-10 text-right text-sm tnum">{progress}%</span>
            <Button size="sm" type="submit" disabled={Number(progress) === goal.manual_progress}>Update</Button>
          </form>
        )}
        {goal.progress_mode === "target" && (
          <form className="mt-4 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (/^\d+(\.\d{1,2})?$/.test(value)) patch.mutate({ current_value: value }); }}>
            <span className="text-sm text-ink-2">{t("Current")}</span>
            <Input className="w-36 tnum" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("Current value")} />
            <span className="text-sm text-ink-3">{t("of {target} {unit}", { target: goal.target_value ?? "", unit: goal.unit ?? "" })}</span>
            <Button size="sm" type="submit" disabled={value === goal.current_value}>Update</Button>
          </form>
        )}
        {goal.last_progress_at && <p className="mt-3 text-2xs text-ink-3">{t("Last progress change {date}", { date: fmtDate(goal.last_progress_at.slice(0, 10)) })}</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title={t("Milestones")} subtitle={goal.progress_mode === "milestones" ? t("Progress is calculated from these") : t("Optional checkpoints")} />
          <ul className="px-2">
            {goal.milestones.map((m) => (
              <li key={m.id} className="group flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-fill/[0.03]">
                <button type="button" aria-label={m.completed_at ? t("Mark incomplete") : t("Mark complete")} onClick={() => toggleMs.mutate({ id: m.id, completed: !m.completed_at })}
                  className={cn("h-[18px] w-[18px] rounded-full border grid place-items-center", m.completed_at ? "bg-accent border-accent text-accent-ink" : "border-ink-3/50 hover:border-accent")}>
                  {m.completed_at && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
                <span className={cn("flex-1 text-sm", m.completed_at && "line-through text-ink-3")}>{m.title}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={t("Delete milestone")} onClick={() => delMs.mutate(m.id)}><X className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2 px-5 py-3" onSubmit={(e) => { e.preventDefault(); if (milestone.trim()) addMs.mutate(milestone.trim()); }}>
            <Input placeholder={t("Add milestone")} value={milestone} maxLength={120} onChange={(e) => setMilestone(e.target.value)} />
            <Button type="submit" disabled={!milestone.trim()}><Plus className="h-4 w-4" /></Button>
          </form>
        </Card>

        <Card>
          <CardHeader title={t("Projects")} action={<Button size="sm" variant="ghost" onClick={() => setProject({ open: true, editing: null })}><Plus className="h-3.5 w-3.5" /> {t("Project")}</Button>} />
          {projects.length === 0 ? <p className="px-5 pb-4 text-xs text-ink-3">{t("Group related tasks into projects (optional).")}</p> : (
            <ul className="px-5 pb-4 space-y-3">
              {projects.map((p) => (
                <li key={p.id} className="group">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <button className="truncate text-left hover:text-accent" onClick={() => setProject({ open: true, editing: p })}><FolderKanban className="inline h-3.5 w-3.5 mr-1.5 text-ink-3" />{p.title}</button>
                    <span className="flex items-center gap-2 text-xs text-ink-3 tnum">
                      {p.status !== "active" && <Badge>{status(p.status)}</Badge>}
                      {tp("{done}/{n} tasks", p.open_tasks + p.done_tasks, { done: p.done_tasks })}
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" aria-label={t("Add task to project")} onClick={() => qa.newTask({ project_id: p.id, goal_id: goal.id })}><Plus className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" aria-label={t("Delete project")} onClick={async () => { if (await confirm({ title: t("Delete project “{title}”?", { title: p.title }), body: t("Its tasks are kept and unlinked.") })) delProject.mutate(p.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </span>
                  </div>
                  {p.progress !== null && <Progress className="mt-1.5" value={p.progress} label={t("{title} progress", { title: p.title })} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t("Tasks for this goal")} subtitle={t("{open} open · {done} done (including project tasks)", { open: goal.open_tasks, done: goal.done_tasks })} action={<Button size="sm" variant="ghost" onClick={() => qa.newTask({ goal_id: goal.id })}><Plus className="h-3.5 w-3.5" /> {t("Task")}</Button>} />
        <div className="px-2 pb-2">
          {tasks.length === 0 ? <p className="px-3 pb-3 text-xs text-ink-3">{t("No tasks linked directly to this goal.")}</p> : tasks.map((t) => <TaskRow key={t.id} task={t} today={today} />)}
        </div>
      </Card>
      <ProjectForm open={project.open} editing={project.editing} goalId={goal.id} onOpenChange={(open) => setProject((s) => ({ ...s, open }))} />
    </div>
  );
}

export function GoalsPage() {
  const [params, setParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<{ open: boolean; editing: Goal | null }>({ open: false, editing: null });
  const { data: goals, isLoading } = useQuery({ queryKey: ["goals", showArchived], queryFn: () => api.get<Goal[]>("/goals", { include_archived: showArchived }) });
  const selectedId = Number(params.get("goal")) || goals?.[0]?.id;
  const selected = goals?.find((g) => g.id === selectedId) ?? goals?.[0];
  useEffect(() => {
    if (params.get("new")) {
      setForm({ open: true, editing: null });
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" value={showArchived ? "all" : "current"} onChange={(v) => setShowArchived(v === "all")} options={[{ value: "current", label: t("Current") }, { value: "all", label: t("Include archived") }]} />
        <Button variant="primary" onClick={() => setForm({ open: true, editing: null })}><Plus className="h-4 w-4" /> {t("New goal")}</Button>
      </div>
      {isLoading ? <LoadingBlock /> : !goals?.length ? (
        <Card><EmptyState icon={<Target className="h-6 w-6" />} title={t("No goals yet")} body={t("Long-term goals give your tasks direction. Break them into milestones and projects, or just track a percentage.")} action={<Button variant="primary" onClick={() => setForm({ open: true, editing: null })}>{t("Create a goal")}</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] gap-5">
          <Card as="div" className="p-2 self-start">
            {goals.map((g) => (
              <button key={g.id} type="button" onClick={() => setParams({ goal: String(g.id) })}
                className={cn("relative w-full flex items-center gap-3 text-left rounded-xl px-2 py-2 transition-colors", selected?.id === g.id ? "bg-accent/10" : "hover:bg-fill/[0.04]")}>
                <img src={goalArt(g.category)} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-[10px] object-cover bg-fill/[0.08]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm font-medium truncate", g.archived && "text-ink-3")}>{g.title}</span>
                    <span className="text-xs tnum text-ink-3">{g.progress}%</span>
                  </span>
                  <Progress className="mt-1.5 h-1" value={g.progress} tone={g.status === "completed" ? "good" : g.overdue ? "warn" : "accent"} label={t("{title} progress", { title: g.title })} />
                  <span className="mt-1 block text-xs text-ink-3 truncate">{category(g.category)}{g.overdue && <span className="text-bad"> · {t("overdue")}</span>}{g.status !== "active" && ` · ${status(g.status).toLowerCase()}`}{g.archived && ` · ${t("archived")}`}</span>
                </span>
              </button>
            ))}
          </Card>
          {selected && <GoalDetail goal={selected} onEdit={() => setForm({ open: true, editing: selected })} />}
        </div>
      )}
      <GoalForm open={form.open} editing={form.editing} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
    </div>
  );
}
