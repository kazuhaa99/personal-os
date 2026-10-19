from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import NotFound, ValidationFailed
from app.models import Goal, GoalProgressLog, Milestone, Project, Task
from app.schemas.planning import GoalCreate, GoalUpdate, MilestoneIn, MilestoneUpdate, ProjectCreate, ProjectUpdate


def compute_progress(goal: Goal) -> int:
    if goal.status == "completed":
        return 100
    if goal.progress_mode == "milestones":
        total = len(goal.milestones)
        done = sum(1 for m in goal.milestones if m.completed_at)
        return round(done * 100 / total) if total else 0
    if goal.progress_mode == "target" and goal.target_value:
        return min(100, int(Decimal(goal.current_value) * 100 / Decimal(goal.target_value)))
    return goal.manual_progress


def _log_if_changed(db: Session, goal: Goal, before: int | None, note: str | None = None) -> None:
    db.flush()
    db.refresh(goal)
    after = compute_progress(goal)
    if before is None or after != before:
        goal.last_progress_at = datetime.now(timezone.utc)
        db.add(GoalProgressLog(goal_id=goal.id, progress=after, note=note))


def _task_counts(db: Session, goal: Goal) -> tuple[int, int]:
    project_ids = select(Project.id).where(Project.goal_id == goal.id)
    stmt = select(Task.status, func.count()).where(
        or_(Task.goal_id == goal.id, Task.project_id.in_(project_ids))
    ).group_by(Task.status)
    return _split_counts(dict(db.execute(stmt).all()))


def _split_counts(by_status: dict[str, int]) -> tuple[int, int]:
    done = by_status.get("done", 0)
    return sum(by_status.values()) - done, done


def serialize(db: Session, goal: Goal, today: date) -> dict:
    progress = compute_progress(goal)
    open_tasks, done_tasks = _task_counts(db, goal)
    projects = list(db.scalars(select(Project).where(Project.goal_id == goal.id).order_by(Project.title)))
    return {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "category": goal.category,
        "target_date": goal.target_date,
        "status": goal.status,
        "progress_mode": goal.progress_mode,
        "progress": progress,
        "manual_progress": goal.manual_progress,
        "target_value": goal.target_value,
        "current_value": goal.current_value,
        "unit": goal.unit,
        "archived": goal.archived_at is not None,
        "overdue": bool(goal.target_date and goal.target_date < today and goal.status != "completed"),
        "days_left": (goal.target_date - today).days if goal.target_date else None,
        "last_progress_at": goal.last_progress_at,
        "milestones": goal.milestones,
        "projects": projects,
        "open_tasks": open_tasks,
        "done_tasks": done_tasks,
        "history": goal.progress_logs[-60:],
        "is_demo": goal.is_demo,
        "created_at": goal.created_at,
    }


def get_goal(db: Session, goal_id: int) -> Goal:
    goal = db.get(Goal, goal_id)
    if goal is None:
        raise NotFound(f"Goal {goal_id} not found")
    return goal


def list_goals(db: Session, include_archived: bool = False) -> list[Goal]:
    stmt = select(Goal).order_by(Goal.status, Goal.target_date.asc().nulls_last(), Goal.title)
    if not include_archived:
        stmt = stmt.where(Goal.archived_at.is_(None))
    return list(db.scalars(stmt))


def create_goal(db: Session, data: GoalCreate, *, is_demo: bool = False) -> Goal:
    goal = Goal(**data.model_dump(exclude={"milestones"}), is_demo=is_demo)
    goal.milestones = [Milestone(title=m.title, due_date=m.due_date, position=i)
                       for i, m in enumerate(data.milestones)]
    db.add(goal)
    _log_if_changed(db, goal, None, "Goal created")
    db.commit()
    return goal


def update_goal(db: Session, goal_id: int, data: GoalUpdate) -> Goal:
    goal = get_goal(db, goal_id)
    before = compute_progress(goal)
    fields = data.model_dump(exclude_unset=True)
    note = fields.pop("progress_note", None)
    archived = fields.pop("archived", None)
    for key in ("title", "category", "status", "progress_mode", "manual_progress", "current_value"):
        if key in fields and fields[key] is None:
            fields.pop(key)
    for key, value in fields.items():
        setattr(goal, key, value)
    if goal.progress_mode == "target" and not goal.target_value:
        raise ValidationFailed("A measurable goal needs a target value")
    if archived is not None:
        goal.archived_at = datetime.now(timezone.utc) if archived else None
    _log_if_changed(db, goal, before, note)
    db.commit()
    return goal


def delete_goal(db: Session, goal_id: int) -> None:
    db.delete(get_goal(db, goal_id))
    db.commit()


def add_milestone(db: Session, goal_id: int, data: MilestoneIn) -> Milestone:
    goal = get_goal(db, goal_id)
    before = compute_progress(goal)
    m = Milestone(goal_id=goal.id, title=data.title, due_date=data.due_date, position=len(goal.milestones))
    db.add(m)
    _log_if_changed(db, goal, before)
    db.commit()
    return m


def update_milestone(db: Session, goal_id: int, milestone_id: int, data: MilestoneUpdate) -> Milestone:
    goal = get_goal(db, goal_id)
    m = db.get(Milestone, milestone_id)
    if m is None or m.goal_id != goal.id:
        raise NotFound("Milestone not found")
    before = compute_progress(goal)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("title"):
        m.title = fields["title"]
    if "due_date" in fields:
        m.due_date = fields["due_date"]
    if fields.get("completed") is not None:
        m.completed_at = datetime.now(timezone.utc) if fields["completed"] else None
    _log_if_changed(db, goal, before, f"Milestone: {m.title}" if "completed" in fields else None)
    db.commit()
    return m


def delete_milestone(db: Session, goal_id: int, milestone_id: int) -> None:
    goal = get_goal(db, goal_id)
    m = db.get(Milestone, milestone_id)
    if m is None or m.goal_id != goal.id:
        raise NotFound("Milestone not found")
    before = compute_progress(goal)
    db.delete(m)
    _log_if_changed(db, goal, before)
    db.commit()


# ------------------------------------------------------------------ projects


def serialize_project(db: Session, p: Project) -> dict:
    open_tasks, done_tasks = _split_counts(dict(db.execute(
        select(Task.status, func.count()).where(Task.project_id == p.id).group_by(Task.status)
    ).all()))
    total = open_tasks + done_tasks
    goal = db.get(Goal, p.goal_id) if p.goal_id else None
    return {
        "id": p.id, "title": p.title, "description": p.description, "goal_id": p.goal_id,
        "goal_title": goal.title if goal else None, "status": p.status, "target_date": p.target_date,
        "open_tasks": open_tasks, "done_tasks": done_tasks,
        "progress": round(done_tasks * 100 / total) if total else None, "is_demo": p.is_demo,
    }


def list_projects(db: Session, goal_id: int | None = None) -> list[Project]:
    stmt = select(Project).order_by(Project.status, Project.title)
    if goal_id:
        stmt = stmt.where(Project.goal_id == goal_id)
    return list(db.scalars(stmt))


def get_project(db: Session, project_id: int) -> Project:
    p = db.get(Project, project_id)
    if p is None:
        raise NotFound(f"Project {project_id} not found")
    return p


def create_project(db: Session, data: ProjectCreate, *, is_demo: bool = False) -> Project:
    if data.goal_id is not None:
        get_goal(db, data.goal_id)
    p = Project(**data.model_dump(), is_demo=is_demo)
    db.add(p)
    db.commit()
    return p


def update_project(db: Session, project_id: int, data: ProjectUpdate) -> Project:
    p = get_project(db, project_id)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("goal_id") is not None:
        get_goal(db, fields["goal_id"])
    for key in ("title", "status"):
        if key in fields and fields[key] is None:
            fields.pop(key)
    for key, value in fields.items():
        setattr(p, key, value)
    db.commit()
    return p


def delete_project(db: Session, project_id: int) -> None:
    db.delete(get_project(db, project_id))
    db.commit()

