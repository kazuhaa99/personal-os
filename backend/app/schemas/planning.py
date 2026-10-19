from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.schemas.common import ORM, HexColor, Input, OptText

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ShortText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=40)]
Priority = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["todo", "in_progress", "done"]
Recurrence = Literal["none", "daily", "weekdays", "weekly", "monthly"]
GoalCategory = Literal["career", "finance", "health", "creative", "personal", "other"]


# ------------------------------------------------------------------ tasks


class TaskCreate(Input):
    title: Title
    description: OptText = None
    due_date: date | None = None
    due_time: time | None = None
    priority: Priority = "medium"
    status: Literal["todo", "in_progress"] = "todo"
    category: ShortText = None
    goal_id: int | None = None
    project_id: int | None = None
    recurrence: Recurrence = "none"

    @model_validator(mode="after")
    def check(self):
        if self.recurrence != "none" and self.due_date is None:
            raise ValueError("recurring tasks need a due date")
        if self.due_time is not None and self.due_date is None:
            raise ValueError("a due time needs a due date")
        return self


class TaskUpdate(Input):
    title: Title | None = None
    description: OptText = None
    due_date: date | None = None
    due_time: time | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None
    category: ShortText = None
    goal_id: int | None = None
    project_id: int | None = None
    recurrence: Recurrence | None = None


class TaskOut(ORM):
    id: int
    title: str
    description: str | None
    due_date: date | None
    due_time: time | None
    priority: str
    status: str
    category: str | None
    goal_id: int | None
    project_id: int | None
    recurrence: str
    completed_at: datetime | None
    is_demo: bool
    created_at: datetime
    overdue: bool = False


class TaskCompleteResult(BaseModel):
    task: TaskOut
    next_instance: TaskOut | None


# ------------------------------------------------------------------ goals


class MilestoneIn(Input):
    title: Title
    due_date: date | None = None


class MilestoneUpdate(Input):
    title: Title | None = None
    due_date: date | None = None
    completed: bool | None = None


class MilestoneOut(ORM):
    id: int
    title: str
    due_date: date | None
    completed_at: datetime | None
    position: int


class GoalCreate(Input):
    title: Title
    description: OptText = None
    category: GoalCategory = "personal"
    target_date: date | None = None
    progress_mode: Literal["manual", "milestones", "target"] = "manual"
    manual_progress: int = Field(default=0, ge=0, le=100)
    target_value: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)] | None = None
    current_value: Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)] = Decimal("0")
    unit: ShortText = None
    milestones: list[MilestoneIn] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def check(self):
        if self.progress_mode == "target" and self.target_value is None:
            raise ValueError("a measurable goal needs a target value")
        return self


class GoalUpdate(Input):
    title: Title | None = None
    description: OptText = None
    category: GoalCategory | None = None
    target_date: date | None = None
    status: Literal["active", "paused", "completed"] | None = None
    progress_mode: Literal["manual", "milestones", "target"] | None = None
    manual_progress: int | None = Field(default=None, ge=0, le=100)
    target_value: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)] | None = None
    current_value: Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)] | None = None
    unit: ShortText = None
    archived: bool | None = None
    progress_note: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)] = None


class ProgressPoint(ORM):
    recorded_at: datetime
    progress: int
    note: str | None


class ProjectRef(ORM):
    id: int
    title: str
    status: str


class GoalOut(BaseModel):
    id: int
    title: str
    description: str | None
    category: str
    target_date: date | None
    status: str
    progress_mode: str
    progress: int
    manual_progress: int
    target_value: Decimal | None
    current_value: Decimal
    unit: str | None
    archived: bool
    overdue: bool
    days_left: int | None
    last_progress_at: datetime | None
    milestones: list[MilestoneOut]
    projects: list[ProjectRef]
    open_tasks: int
    done_tasks: int
    history: list[ProgressPoint]
    is_demo: bool
    created_at: datetime


class ProjectCreate(Input):
    title: Title
    description: OptText = None
    goal_id: int | None = None
    status: Literal["active", "on_hold", "completed"] = "active"
    target_date: date | None = None


class ProjectUpdate(Input):
    title: Title | None = None
    description: OptText = None
    goal_id: int | None = None
    status: Literal["active", "on_hold", "completed"] | None = None
    target_date: date | None = None


class ProjectOut(BaseModel):
    id: int
    title: str
    description: str | None
    goal_id: int | None
    goal_title: str | None
    status: str
    target_date: date | None
    open_tasks: int
    done_tasks: int
    progress: int | None
    is_demo: bool


# ------------------------------------------------------------------ habits


class HabitCreate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    description: OptText = None
    schedule: Literal["daily", "weekdays"] = "daily"
    weekdays: list[Annotated[int, Field(ge=0, le=6)]] = Field(default_factory=list)  # 0 = Monday
    color: HexColor = "#7c9cff"
    start_date: date | None = None

    @model_validator(mode="after")
    def check(self):
        if self.schedule == "weekdays" and not self.weekdays:
            raise ValueError("pick at least one weekday")
        return self


class HabitUpdate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    description: OptText = None
    schedule: Literal["daily", "weekdays"] | None = None
    weekdays: list[Annotated[int, Field(ge=0, le=6)]] | None = None
    color: HexColor | None = None
    is_archived: bool | None = None


class HabitToggle(Input):
    date: date
    done: bool


class HabitOut(BaseModel):
    id: int
    name: str
    description: str | None
    schedule: str
    weekdays: list[int]
    color: str
    start_date: date
    is_archived: bool
    is_demo: bool
    scheduled_today: bool
    done_today: bool
    current_streak: int
    longest_streak: int
    week_rate: Decimal | None
    month_rate: Decimal | None
    all_time_rate: Decimal | None
    total_completions: int
    completions: list[date]  # within the requested history window


# ------------------------------------------------------------------ settings


class SettingsOut(ORM):
    owner_name: str
    primary_currency: str
    timezone: str
    week_starts_on: int


class SettingsUpdate(Input):
    owner_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    timezone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)] | None = None
    primary_currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")] | None = None
