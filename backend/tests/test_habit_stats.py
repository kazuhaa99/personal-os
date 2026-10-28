"""Habit statistics stay exact and cheap however far back a habit starts."""

import random
import time
from datetime import date, timedelta
from types import SimpleNamespace

from app.services import habits
from app.services.money import percent


def _naive(habit, done, today, start, end):
    """Day-by-day reference: the obvious, slow definition."""
    days = [habit.start_date + timedelta(days=i) for i in range((today - habit.start_date).days + 1)]
    sched = [d for d in days if habits.is_scheduled(habit, d)]
    longest = run = 0
    for d in sched:
        if d in done:
            run += 1
            longest = max(longest, run)
        elif d != today:
            run = 0
    window = [d for d in sched if max(start, habit.start_date) <= d <= end]
    return longest, percent(sum(d in done for d in window), len(window))


def _habit(start, schedule="daily", mask=0):
    return SimpleNamespace(start_date=start, schedule=schedule, weekday_mask=mask)


def test_stats_match_the_day_by_day_definition():
    rng = random.Random(7)
    today = date(2026, 10, 27)
    for _ in range(300):
        start = today - timedelta(days=rng.randint(0, 400))
        schedule = rng.choice(["daily", "weekdays"])
        habit = _habit(start, schedule, rng.randint(1, 127) if schedule == "weekdays" else 0)
        done = {start + timedelta(days=rng.randint(0, (today - start).days)) for _ in range(rng.randint(0, 120))}
        done = {d for d in done if habits.is_scheduled(habit, d)}
        lo = today - timedelta(days=rng.randint(0, 500))
        current, longest = habits.streaks(habit, done, today)
        want_longest, want_rate = _naive(habit, done, today, lo, today)
        assert longest == max(want_longest, current)
        assert habits.rate(habit, done, lo, today) == want_rate


def test_a_habit_started_in_year_one_is_still_fast():
    today = date(2026, 10, 27)
    habit = _habit(date(1, 1, 1), "weekdays", 0b0010101)
    done = {today - timedelta(days=i) for i in range(0, 60, 2) if habits.is_scheduled(habit, today - timedelta(days=i))}
    t = time.perf_counter()
    for _ in range(20):
        habits.streaks(habit, done, today)
        habits.rate(habit, done, habit.start_date, today)
    assert time.perf_counter() - t < 0.2
