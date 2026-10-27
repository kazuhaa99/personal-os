"""Habits and completion statistics.

A day "counts" only if the habit is scheduled on it and on/after its start date.
Completion rates are reported alongside streaks so a single missed day doesn't
erase the picture of overall consistency.
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.errors import NotFound, ValidationFailed
from app.models import Habit, HabitCompletion
from app.schemas.planning import HabitCreate, HabitUpdate
from app.services.dates import today_for
from app.services.money import percent


def weekdays_to_mask(days: list[int]) -> int:
    mask = 0
    for d in set(days):
        mask |= 1 << d
    return mask


def mask_to_weekdays(mask: int) -> list[int]:
    return [d for d in range(7) if mask & (1 << d)]


def is_scheduled(habit: Habit, d: date) -> bool:
    if d < habit.start_date:
        return False
    return habit.schedule == "daily" or bool(habit.weekday_mask & (1 << d.weekday()))


def completion_dates(db: Session, habit_id: int) -> set[date]:
    return set(db.scalars(select(HabitCompletion.date).where(HabitCompletion.habit_id == habit_id)))


def streaks(habit: Habit, done: set[date], today: date) -> tuple[int, int]:
    """(current, longest) streak counted in scheduled days.

    Today's scheduled-but-not-yet-done slot does not break the current streak."""
    current = 0
    d = today
    if is_scheduled(habit, d) and d not in done:
        d -= timedelta(days=1)
    while d >= habit.start_date:
        if is_scheduled(habit, d):
            if d in done:
                current += 1
            else:
                break
        d -= timedelta(days=1)

    # Nothing before the first check-in can be part of a run: start counting there.
    longest = run = 0
    d = max(habit.start_date, min(done, default=today))
    while d <= today:
        if is_scheduled(habit, d):
            if d in done:
                run += 1
                longest = max(longest, run)
            elif d != today:
                run = 0
        d += timedelta(days=1)
    return current, max(longest, current)


def _scheduled_count(habit: Habit, start: date, end: date) -> int:
    """Scheduled days in [start, end], by whole weeks plus the few days left over."""
    if end < start:
        return 0
    days = (end - start).days + 1
    if habit.schedule == "daily":
        return days
    weeks, rest = divmod(days, 7)
    leftover = sum(1 for i in range(rest) if habit.weekday_mask & (1 << (start + timedelta(days=i)).weekday()))
    return weeks * bin(habit.weekday_mask & 0b1111111).count("1") + leftover


def rate(habit: Habit, done: set[date], start: date, end: date) -> Decimal | None:
    start = max(start, habit.start_date)
    completed = sum(1 for d in done if start <= d <= end and is_scheduled(habit, d))
    return percent(completed, _scheduled_count(habit, start, end))


def serialize(db: Session, habit: Habit, today: date, history_days: int = 180) -> dict:
    done = completion_dates(db, habit.id)
    current, longest = streaks(habit, done, today)
    window_start = today - timedelta(days=history_days)
    return {
        "id": habit.id,
        "name": habit.name,
        "description": habit.description,
        "schedule": habit.schedule,
        "weekdays": mask_to_weekdays(habit.weekday_mask),
        "color": habit.color,
        "start_date": habit.start_date,
        "is_archived": habit.is_archived,
        "is_demo": habit.is_demo,
        "scheduled_today": is_scheduled(habit, today),
        "done_today": today in done,
        "current_streak": current,
        "longest_streak": longest,
        "week_rate": rate(habit, done, today - timedelta(days=6), today),
        "month_rate": rate(habit, done, today - timedelta(days=29), today),
        "all_time_rate": rate(habit, done, habit.start_date, today),
        "total_completions": len(done),
        "completions": sorted(d for d in done if d >= window_start),
    }


def get_habit(db: Session, habit_id: int) -> Habit:
    h = db.get(Habit, habit_id)
    if h is None:
        raise NotFound(f"Habit {habit_id} not found")
    return h


def list_habits(db: Session, include_archived: bool = False) -> list[Habit]:
    stmt = select(Habit).order_by(Habit.is_archived, Habit.id)
    if not include_archived:
        stmt = stmt.where(Habit.is_archived.is_(False))
    return list(db.scalars(stmt))


def create_habit(db: Session, data: HabitCreate, *, is_demo: bool = False) -> Habit:
    habit = Habit(
        name=data.name,
        description=data.description,
        schedule=data.schedule,
        weekday_mask=weekdays_to_mask(data.weekdays) if data.schedule == "weekdays" else 0,
        color=data.color,
        start_date=data.start_date or today_for(db),
        is_demo=is_demo,
    )
    db.add(habit)
    db.commit()
    return habit


def update_habit(db: Session, habit_id: int, data: HabitUpdate) -> Habit:
    habit = get_habit(db, habit_id)
    fields = data.model_dump(exclude_unset=True, exclude_none=True)
    weekdays = fields.pop("weekdays", None)
    for key, value in fields.items():
        setattr(habit, key, value)
    if weekdays is not None:
        habit.weekday_mask = weekdays_to_mask(weekdays)
    if habit.schedule == "weekdays" and habit.weekday_mask == 0:
        raise ValidationFailed("Pick at least one weekday")
    if habit.schedule == "daily":
        habit.weekday_mask = 0
    db.commit()
    return habit


def delete_habit(db: Session, habit_id: int) -> None:
    db.delete(get_habit(db, habit_id))
    db.commit()


def set_completion(db: Session, habit_id: int, day: date, done: bool) -> None:
    """Idempotent: marking done twice keeps a single record (unique habit_id+date)."""
    habit = get_habit(db, habit_id)
    if day > today_for(db):
        raise ValidationFailed("Habits cannot be completed in the future")
    if day < habit.start_date:
        raise ValidationFailed(f"'{habit.name}' starts on {habit.start_date}")
    if done:
        db.execute(
            insert(HabitCompletion)
            .values(habit_id=habit.id, date=day, user_id=habit.user_id)
            .on_conflict_do_nothing(constraint="uq_habit_completions_habit_date")
        )
    else:
        db.query(HabitCompletion).filter(HabitCompletion.habit_id == habit.id, HabitCompletion.date == day).delete()
    db.commit()
