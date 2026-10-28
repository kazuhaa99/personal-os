"""List and overview endpoints take a fixed number of queries, however many records there are."""

import pytest
from sqlalchemy import event

from app.db import engine
from tests.test_budgets_recurring_installments import _plan, _rule


def _queries(action) -> int:
    count = 0

    def on_execute(*_):
        nonlocal count
        count += 1

    event.listen(engine, "before_cursor_execute", on_execute)
    try:
        action()
    finally:
        event.remove(engine, "before_cursor_execute", on_execute)
    return count


def _fill(api, n: int, acc: int) -> None:
    for i in range(n):
        _rule(api, acc, name=f"Rule {i}", start="2026-01-10")
        _plan(api, acc, name=f"Plan {i}")
        api.ok(api.c.post("/api/habits", json={"name": f"Habit {i}"}))
        api.ok(api.c.post("/api/goals", json={"title": f"Goal {i}", "manual_progress": 10}))
        api.ok(api.c.post("/api/tasks", json={"title": f"Task {i}", "due_date": "2026-01-10"}))
        api.expense(acc, "10", d="2026-03-10")


ENDPOINTS = ["/api/recurring", "/api/recurring/expected?days=365", "/api/installments", "/api/habits", "/api/goals",
             "/api/tasks?view=all", "/api/dashboard", "/api/analytics/summary", "/api/transactions"]


@pytest.mark.parametrize("path", ENDPOINTS)
def test_query_count_does_not_grow_with_the_data(api, path):
    acc = api.account(opening="1000000")
    _fill(api, 2, acc)
    few = _queries(lambda: api.ok(api.c.get(path)))
    _fill(api, 10, acc)
    many = _queries(lambda: api.ok(api.c.get(path)))
    assert many <= few, f"{path}: {few} queries with 2 of each, {many} with 12"


def test_batched_goal_and_habit_details_match_one_at_a_time(api, db):
    from app.services import goals, habits
    from app.services.dates import today_for

    g1 = api.ok(api.c.post("/api/goals", json={"title": "One", "manual_progress": 10}))
    g2 = api.ok(api.c.post("/api/goals", json={"title": "Two", "manual_progress": 20}))
    p1 = api.ok(api.c.post("/api/projects", json={"title": "P1", "goal_id": g1["id"]}))
    links = ({"goal_id": g1["id"]}, {"project_id": p1["id"]}, {"goal_id": g1["id"], "project_id": p1["id"]},
             {"goal_id": g2["id"]}, {})
    created = [api.ok(api.c.post("/api/tasks", json={"title": "t", **body})) for body in links]
    api.ok(api.c.patch(f"/api/tasks/{created[2]['id']}", json={"status": "done"}))  # goal and project at once
    h = api.ok(api.c.post("/api/habits", json={"name": "Walk"}))
    api.ok(api.c.put(f"/api/habits/{h['id']}/completions", json={"date": h["start_date"], "done": True}))

    today = today_for(db)
    all_goals = goals.list_goals(db)
    batched = goals.serialize_many(db, all_goals, today)
    assert batched == [goals.serialize(db, g, today) for g in all_goals]
    assert {g["title"]: (g["open_tasks"], g["done_tasks"]) for g in batched} == {"One": (2, 1), "Two": (1, 0)}
    all_habits = habits.list_habits(db)
    assert habits.serialize_many(db, all_habits, today) == [habits.serialize(db, x, today) for x in all_habits]
