import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import NotFound, ValidationFailed
from app.models import Goal, Project, Task
from app.schemas.planning import TaskCreate, TaskUpdate
from app.services.dates import add_months, today_for

VIEWS = ("today", "upcoming", "all", "completed", "overdue")
PRIORITY_ORDER = case(
    {"urgent": 0, "high": 1, "medium": 2, "low": 3}, value=Task.priority, else_=4
)


def next_due(task: Task, today: date) -> date:
    """Next due date for a recurring task, never in the past."""
    assert task.due_date is not None
    d = task.due_date
    while True:
        if task.recurrence == "daily":
            d = d + timedelta(days=1)
        elif task.recurrence == "weekdays":
            d = d + timedelta(days=1)
            while d.weekday() >= 5:
                d = d + timedelta(days=1)
        elif task.recurrence == "weekly":
            d = d + timedelta(weeks=1)
        elif task.recurrence == "monthly":
            d = add_months(d, 1, task.due_date.day)
        else:
            raise ValueError("task is not recurring")
        if d >= today:
            return d


def serialize(task: Task, today: date) -> dict:
    return {
        **{c: getattr(task, c) for c in (
            "id", "title", "description", "due_date", "due_time", "priority", "status", "category",
            "goal_id", "project_id", "recurrence", "completed_at", "is_demo", "created_at")},
        "overdue": task.status != "done" and task.due_date is not None and task.due_date < today,
    }


def _check_links(db: Session, goal_id: int | None, project_id: int | None) -> None:
    if goal_id is not None and db.get(Goal, goal_id) is None:
        raise ValidationFailed(f"Goal {goal_id} does not exist")
    if project_id is not None and db.get(Project, project_id) is None:
        raise ValidationFailed(f"Project {project_id} does not exist")


def get_task(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise NotFound(f"Task {task_id} not found")
    return task


def list_tasks(db: Session, view: str = "all", *, priority: str | None = None, category: str | None = None,
               status: str | None = None, goal_id: int | None = None, project_id: int | None = None,
               search: str | None = None, today: date | None = None) -> list[Task]:
    today = today or today_for(db)
    stmt = select(Task)
    open_ = Task.status != "done"
    if view == "today":
        stmt = stmt.where(open_, Task.due_date.is_not(None), Task.due_date <= today)
    elif view == "upcoming":
        stmt = stmt.where(open_, Task.due_date > today)
    elif view == "completed":
        stmt = stmt.where(Task.status == "done")
    elif view == "overdue":
        stmt = stmt.where(open_, Task.due_date < today)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if category:
        stmt = stmt.where(func.lower(Task.category) == category.lower())
    if status:
        stmt = stmt.where(Task.status == status)
    if goal_id:
        stmt = stmt.where(Task.goal_id == goal_id)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(func.lower(Task.title).like(like), func.lower(func.coalesce(Task.description, "")).like(like)))
    if view == "completed":
        stmt = stmt.order_by(Task.completed_at.desc().nulls_last()).limit(300)
    else:
        stmt = stmt.order_by(Task.status == "done", Task.due_date.asc().nulls_last(), Task.due_time.asc().nulls_last(),
                             PRIORITY_ORDER, Task.id)
    return list(db.scalars(stmt))


def create_task(db: Session, data: TaskCreate, *, is_demo: bool = False) -> Task:
    _check_links(db, data.goal_id, data.project_id)
    task = Task(**data.model_dump(), is_demo=is_demo)
    if task.recurrence != "none":
        task.series_id = str(uuid.uuid4())
    db.add(task)
    db.commit()
    return task


def update_task(db: Session, task_id: int, data: TaskUpdate) -> Task:
    task = get_task(db, task_id)
    fields = data.model_dump(exclude_unset=True)
    for key in ("title", "priority", "status", "recurrence"):
        if key in fields and fields[key] is None:
            fields.pop(key)
    _check_links(db, fields.get("goal_id"), fields.get("project_id"))
    for key, value in fields.items():
        setattr(task, key, value)
    if task.recurrence != "none" and task.due_date is None:
        raise ValidationFailed("Recurring tasks need a due date")
    if task.due_time is not None and task.due_date is None:
        raise ValidationFailed("A due time needs a due date")
    if task.recurrence != "none" and task.series_id is None:
        task.series_id = str(uuid.uuid4())
    if "status" in fields:
        task.completed_at = datetime.now(timezone.utc) if task.status == "done" else None
    db.commit()
    return task


def complete_task(db: Session, task_id: int) -> tuple[Task, Task | None]:
    """Mark done. For a recurring task, create the next instance exactly once."""
    task = get_task(db, task_id)
    if task.status == "done":
        return task, None
    task.status = "done"
    task.completed_at = datetime.now(timezone.utc)
    nxt = None
    if task.recurrence != "none" and task.due_date is not None:
        due = next_due(task, today_for(db))
        exists = db.scalar(select(Task).where(Task.series_id == task.series_id, Task.due_date == due))
        if exists is None:
            nxt = Task(
                title=task.title, description=task.description, due_date=due, due_time=task.due_time,
                priority=task.priority, category=task.category, goal_id=task.goal_id, project_id=task.project_id,
                recurrence=task.recurrence, series_id=task.series_id, is_demo=task.is_demo,
            )
            db.add(nxt)
    try:
        db.commit()
    except IntegrityError:  # concurrent completion already created the next instance
        db.rollback()
        task = get_task(db, task_id)
        nxt = None
    return task, nxt


def reopen_task(db: Session, task_id: int) -> Task:
    task = get_task(db, task_id)
    task.status = "todo"
    task.completed_at = None
    db.commit()
    return task


def delete_task(db: Session, task_id: int) -> None:
    db.delete(get_task(db, task_id))
    db.commit()


def counts(db: Session, today: date) -> dict[str, int]:
    from app.services.settings import get_app_settings

    open_ = Task.status != "done"
    local_completed = func.date(func.timezone(get_app_settings(db).timezone, Task.completed_at))
    return {
        "today": db.scalar(select(func.count()).where(open_, Task.due_date == today)) or 0,
        "overdue": db.scalar(select(func.count()).where(open_, Task.due_date < today)) or 0,
        "upcoming_7d": db.scalar(
            select(func.count()).where(open_, Task.due_date > today, Task.due_date <= today + timedelta(days=7))
        ) or 0,
        "done_today": db.scalar(
            select(func.count()).where(Task.status == "done", local_completed == today)
        ) or 0,
    }
