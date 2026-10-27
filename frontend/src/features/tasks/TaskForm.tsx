import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Goal, Priority, Project, Task } from "@/lib/types";
import { Modal } from "@/components/ui/dialog";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";

export interface TaskDraft { goal_id?: number; project_id?: number; due_date?: string }

export function TaskForm({ open, onOpenChange, editing, draft }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: Task | null; draft?: TaskDraft }) {
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal[]>("/goals"), enabled: open });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects"), enabled: open });
  const { data: categories = [] } = useQuery({ queryKey: ["task-categories"], queryFn: () => api.get<string[]>("/tasks/categories"), enabled: open });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [category, setCategory] = useState("");
  const [goalId, setGoalId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [recurrence, setRecurrence] = useState<Task["recurrence"]>("none");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setDueDate(editing ? editing.due_date ?? "" : draft?.due_date ?? todayISO());
    setDueTime(editing?.due_time?.slice(0, 5) ?? "");
    setPriority(editing?.priority ?? "medium");
    setCategory(editing?.category ?? "");
    setGoalId(String(editing?.goal_id ?? draft?.goal_id ?? ""));
    setProjectId(String(editing?.project_id ?? draft?.project_id ?? ""));
    setRecurrence(editing?.recurrence ?? "none");
  }, [open, editing, draft]);

  const save = useAction(
    (body: Record<string, unknown>) => (editing ? api.patch(`/tasks/${editing.id}`, body) : api.post("/tasks", body)),
    { refresh: ["tasks"], success: editing ? t("Task updated") : t("Task added"), onSuccess: () => onOpenChange(false) },
  );

  function submit() {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = t("Give the task a title");
    if (recurrence !== "none" && !dueDate) e.due = t("Recurring tasks need a due date");
    if (dueTime && !dueDate) e.due = t("A time needs a date");
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
      priority,
      category: category.trim() || null,
      goal_id: goalId ? Number(goalId) : null,
      project_id: projectId ? Number(projectId) : null,
      recurrence,
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editing ? t("Edit task") : t("New task")} onSubmit={submit}
      footer={<><Button onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" variant="primary" loading={save.isPending}>{editing ? t("Save") : t("Add task")}</Button></>}>
      <Field label={t("Title")} error={errors.title}>
        {(id) => <Input id={id} autoFocus value={title} maxLength={200} placeholder={t("What needs to be done?")} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />}
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t("Due date")} error={errors.due} className="col-span-2">
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              {dueDate && <Button variant="ghost" size="sm" className="h-9" onClick={() => { setDueDate(""); setDueTime(""); }}>{t("Clear")}</Button>}
            </div>
          )}
        </Field>
        <Field label={t("Time")}>
          {(id) => <Input id={id} type="time" value={dueTime} disabled={!dueDate} onChange={(e) => setDueTime(e.target.value)} />}
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t("Priority")}>
          {(id) => (
            <Select id={id} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">{t("Low")}</option><option value="medium">{t("Medium")}</option><option value="high">{t("High")}</option><option value="urgent">{t("Urgent")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("Repeats")}>
          {(id) => (
            <Select id={id} value={recurrence} onChange={(e) => setRecurrence(e.target.value as Task["recurrence"])}>
              <option value="none">{t("Never")}</option><option value="daily">{t("Daily")}</option><option value="weekdays">{t("Weekdays")}</option><option value="weekly">{t("Weekly")}</option><option value="monthly">{t("Monthly")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("Category")}>
          {(id) => (
            <>
              <Input id={id} list={`${id}-list`} value={category} maxLength={40} placeholder={t("optional")} onChange={(e) => setCategory(e.target.value)} />
              <datalist id={`${id}-list`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Goal (optional)")}>
          {(id) => (
            <Select id={id} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">{t("None")}</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("Project (optional)")}>
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t("None")}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t("Notes")}>
        {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
    </Modal>
  );
}
