from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.planning import (
    GoalCreate,
    GoalOut,
    GoalUpdate,
    HabitCreate,
    HabitOut,
    HabitToggle,
    HabitUpdate,
    MilestoneIn,
    MilestoneUpdate,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    TaskCompleteResult,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from app.services import goals, habits, tasks
from app.services.dates import today_for

router = APIRouter()


# ------------------------------------------------------------------ tasks


@router.get("/tasks", response_model=list[TaskOut], tags=["tasks"])
def list_tasks(
    view: Literal["today", "upcoming", "all", "completed", "overdue"] = "all",
    priority: Literal["low", "medium", "high", "urgent"] | None = None,
    status: Literal["todo", "in_progress", "done"] | None = None,
    category: str | None = Query(default=None, max_length=40),
    goal_id: int | None = None,
    project_id: int | None = None,
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
):
    today = today_for(db)
    rows = tasks.list_tasks(db, view, priority=priority, status=status, category=category, goal_id=goal_id,
                            project_id=project_id, search=q, today=today)
    return [tasks.serialize(t, today) for t in rows]


@router.get("/tasks/categories", response_model=list[str], tags=["tasks"])
def task_categories(db: Session = Depends(get_db)):
    from sqlalchemy import select

    from app.models import Task
    return sorted({c for c in db.scalars(select(Task.category).where(Task.category.is_not(None)).distinct()) if c})


@router.post("/tasks", response_model=TaskOut, status_code=201, tags=["tasks"])
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    return tasks.serialize(tasks.create_task(db, data), today_for(db))


@router.patch("/tasks/{task_id}", response_model=TaskOut, tags=["tasks"])
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    return tasks.serialize(tasks.update_task(db, task_id, data), today_for(db))


@router.post("/tasks/{task_id}/complete", response_model=TaskCompleteResult, tags=["tasks"])
def complete_task(task_id: int, db: Session = Depends(get_db)):
    today = today_for(db)
    task, nxt = tasks.complete_task(db, task_id)
    return {"task": tasks.serialize(task, today), "next_instance": tasks.serialize(nxt, today) if nxt else None}


@router.post("/tasks/{task_id}/reopen", response_model=TaskOut, tags=["tasks"])
def reopen_task(task_id: int, db: Session = Depends(get_db)):
    return tasks.serialize(tasks.reopen_task(db, task_id), today_for(db))


@router.delete("/tasks/{task_id}", status_code=204, tags=["tasks"])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    tasks.delete_task(db, task_id)


# ------------------------------------------------------------------ goals


@router.get("/goals", response_model=list[GoalOut], tags=["goals"])
def list_goals(include_archived: bool = False, db: Session = Depends(get_db)):
    today = today_for(db)
    return goals.serialize_many(db, goals.list_goals(db, include_archived), today)


@router.post("/goals", response_model=GoalOut, status_code=201, tags=["goals"])
def create_goal(data: GoalCreate, db: Session = Depends(get_db)):
    return goals.serialize(db, goals.create_goal(db, data), today_for(db))


@router.get("/goals/{goal_id}", response_model=GoalOut, tags=["goals"])
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    return goals.serialize(db, goals.get_goal(db, goal_id), today_for(db))


@router.patch("/goals/{goal_id}", response_model=GoalOut, tags=["goals"])
def update_goal(goal_id: int, data: GoalUpdate, db: Session = Depends(get_db)):
    return goals.serialize(db, goals.update_goal(db, goal_id, data), today_for(db))


@router.delete("/goals/{goal_id}", status_code=204, tags=["goals"])
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goals.delete_goal(db, goal_id)


@router.post("/goals/{goal_id}/milestones", response_model=GoalOut, status_code=201, tags=["goals"])
def add_milestone(goal_id: int, data: MilestoneIn, db: Session = Depends(get_db)):
    goals.add_milestone(db, goal_id, data)
    return goals.serialize(db, goals.get_goal(db, goal_id), today_for(db))


@router.patch("/goals/{goal_id}/milestones/{milestone_id}", response_model=GoalOut, tags=["goals"])
def update_milestone(goal_id: int, milestone_id: int, data: MilestoneUpdate, db: Session = Depends(get_db)):
    goals.update_milestone(db, goal_id, milestone_id, data)
    return goals.serialize(db, goals.get_goal(db, goal_id), today_for(db))


@router.delete("/goals/{goal_id}/milestones/{milestone_id}", response_model=GoalOut, tags=["goals"])
def delete_milestone(goal_id: int, milestone_id: int, db: Session = Depends(get_db)):
    goals.delete_milestone(db, goal_id, milestone_id)
    return goals.serialize(db, goals.get_goal(db, goal_id), today_for(db))


# ------------------------------------------------------------------ projects


@router.get("/projects", response_model=list[ProjectOut], tags=["projects"])
def list_projects(goal_id: int | None = None, db: Session = Depends(get_db)):
    return [goals.serialize_project(db, p) for p in goals.list_projects(db, goal_id)]


@router.post("/projects", response_model=ProjectOut, status_code=201, tags=["projects"])
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    return goals.serialize_project(db, goals.create_project(db, data))


@router.patch("/projects/{project_id}", response_model=ProjectOut, tags=["projects"])
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    return goals.serialize_project(db, goals.update_project(db, project_id, data))


@router.delete("/projects/{project_id}", status_code=204, tags=["projects"])
def delete_project(project_id: int, db: Session = Depends(get_db)):
    goals.delete_project(db, project_id)


# ------------------------------------------------------------------ habits


@router.get("/habits", response_model=list[HabitOut], tags=["habits"])
def list_habits(include_archived: bool = False, history_days: int = Query(180, ge=7, le=730),
                db: Session = Depends(get_db)):
    today = today_for(db)
    return habits.serialize_many(db, habits.list_habits(db, include_archived), today, history_days)


@router.post("/habits", response_model=HabitOut, status_code=201, tags=["habits"])
def create_habit(data: HabitCreate, db: Session = Depends(get_db)):
    return habits.serialize(db, habits.create_habit(db, data), today_for(db))


@router.patch("/habits/{habit_id}", response_model=HabitOut, tags=["habits"])
def update_habit(habit_id: int, data: HabitUpdate, db: Session = Depends(get_db)):
    return habits.serialize(db, habits.update_habit(db, habit_id, data), today_for(db))


@router.delete("/habits/{habit_id}", status_code=204, tags=["habits"])
def delete_habit(habit_id: int, db: Session = Depends(get_db)):
    habits.delete_habit(db, habit_id)


@router.put("/habits/{habit_id}/completions", response_model=HabitOut, tags=["habits"])
def toggle_completion(habit_id: int, data: HabitToggle, db: Session = Depends(get_db)):
    habits.set_completion(db, habit_id, data.date, data.done)
    return habits.serialize(db, habits.get_habit(db, habit_id), today_for(db))
