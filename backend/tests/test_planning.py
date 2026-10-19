from datetime import date, timedelta

from app.models import Habit
from app.services.habits import streaks


# ------------------------------------------------------------------ tasks


def test_task_lifecycle_and_views(api, today):
    c = api.c
    t1 = api.ok(c.post("/api/tasks", json={"title": "Today", "due_date": today.isoformat(), "priority": "high"}))
    api.ok(c.post("/api/tasks", json={"title": "Late", "due_date": (today - timedelta(days=2)).isoformat()}))
    api.ok(c.post("/api/tasks", json={"title": "Later", "due_date": (today + timedelta(days=3)).isoformat()}))
    api.ok(c.post("/api/tasks", json={"title": "Someday"}))

    titles = lambda view: [t["title"] for t in api.ok(c.get(f"/api/tasks?view={view}"))]  # noqa: E731
    assert titles("today") == ["Late", "Today"]
    assert titles("overdue") == ["Late"]
    assert titles("upcoming") == ["Later"]
    assert len(titles("all")) == 4

    done = api.ok(c.post(f"/api/tasks/{t1['id']}/complete"))
    assert done["task"]["status"] == "done" and done["task"]["completed_at"] and done["next_instance"] is None
    assert titles("completed") == ["Today"]
    assert "Today" not in titles("today")

    reopened = api.ok(c.post(f"/api/tasks/{t1['id']}/reopen"))
    assert reopened["status"] == "todo" and reopened["completed_at"] is None

    api.ok(c.patch(f"/api/tasks/{t1['id']}", json={"title": "Renamed", "priority": "low"}))
    assert api.ok(c.get("/api/tasks?priority=low"))[0]["title"] == "Renamed"
    api.ok(c.delete(f"/api/tasks/{t1['id']}"))
    assert len(titles("all")) == 3


def test_task_validation(api):
    assert api.c.post("/api/tasks", json={"title": ""}).status_code == 422
    assert api.c.post("/api/tasks", json={"title": "x", "recurrence": "daily"}).status_code == 422
    assert api.c.post("/api/tasks", json={"title": "x", "due_time": "10:00"}).status_code == 422
    assert api.c.post("/api/tasks", json={"title": "x", "priority": "asap"}).status_code == 422


def test_recurring_task_spawns_next_instance_once(api, today):
    t = api.ok(api.c.post("/api/tasks", json={"title": "Practice", "due_date": today.isoformat(),
                                              "recurrence": "daily"}))
    res = api.ok(api.c.post(f"/api/tasks/{t['id']}/complete"))
    assert res["next_instance"]["due_date"] == (today + timedelta(days=1)).isoformat()
    again = api.ok(api.c.post(f"/api/tasks/{t['id']}/complete"))  # already done: no-op
    assert again["next_instance"] is None
    # reopen + complete again must not create a duplicate follow-up
    api.ok(api.c.post(f"/api/tasks/{t['id']}/reopen"))
    third = api.ok(api.c.post(f"/api/tasks/{t['id']}/complete"))
    assert third["next_instance"] is None
    assert len([x for x in api.ok(api.c.get("/api/tasks")) if x["title"] == "Practice"]) == 2


def test_overdue_recurring_task_rolls_forward_to_today(api, today):
    t = api.ok(api.c.post("/api/tasks", json={"title": "Water plants", "recurrence": "weekly",
                                              "due_date": (today - timedelta(days=15)).isoformat()}))
    nxt = api.ok(api.c.post(f"/api/tasks/{t['id']}/complete"))["next_instance"]
    assert today <= date.fromisoformat(nxt["due_date"]) < today + timedelta(days=7)


# ------------------------------------------------------------------ goals & projects


def test_goal_progress_modes_and_history(api):
    c = api.c
    g = api.ok(c.post("/api/goals", json={"title": "Guitar", "progress_mode": "milestones",
                                          "milestones": [{"title": "A"}, {"title": "B"}, {"title": "C"},
                                                         {"title": "D"}]}))
    assert g["progress"] == 0
    g = api.ok(c.patch(f"/api/goals/{g['id']}/milestones/{g['milestones'][0]['id']}", json={"completed": True}))
    assert g["progress"] == 25 and len(g["history"]) == 2

    m = api.ok(c.post("/api/goals", json={"title": "Fund", "category": "finance", "progress_mode": "target",
                                          "target_value": "1000", "current_value": "250"}))
    assert m["progress"] == 25
    m = api.ok(c.patch(f"/api/goals/{m['id']}", json={"current_value": "1200"}))
    assert m["progress"] == 100
    assert c.post("/api/goals", json={"title": "x", "progress_mode": "target"}).status_code == 422

    man = api.ok(c.post("/api/goals", json={"title": "Read", "manual_progress": 40}))
    assert man["progress"] == 40
    assert c.patch(f"/api/goals/{man['id']}", json={"manual_progress": 101}).status_code == 422


def test_goal_archive_projects_and_task_links(api, today):
    c = api.c
    g = api.ok(c.post("/api/goals", json={"title": "Career", "category": "career",
                                          "target_date": (today - timedelta(days=1)).isoformat()}))
    assert g["overdue"] is True
    p = api.ok(c.post("/api/projects", json={"title": "Portfolio", "goal_id": g["id"]}))
    t1 = api.ok(c.post("/api/tasks", json={"title": "Write CV", "project_id": p["id"]}))
    api.ok(c.post("/api/tasks", json={"title": "Apply", "goal_id": g["id"]}))
    api.ok(c.post("/api/tasks", json={"title": "Unrelated"}))  # tasks don't need a goal
    api.ok(c.post(f"/api/tasks/{t1['id']}/complete"))

    g = api.ok(c.get(f"/api/goals/{g['id']}"))
    assert (g["open_tasks"], g["done_tasks"]) == (1, 1)
    assert g["projects"][0]["title"] == "Portfolio"
    assert api.ok(c.get("/api/projects"))[0]["progress"] == 100

    api.ok(c.patch(f"/api/goals/{g['id']}", json={"archived": True}))
    assert api.ok(c.get("/api/goals")) == []
    assert len(api.ok(c.get("/api/goals?include_archived=true"))) == 1

    api.ok(c.delete(f"/api/goals/{g['id']}"))
    assert api.ok(c.get("/api/projects"))[0]["goal_id"] is None  # project survives, link cleared
    assert len(api.ok(c.get("/api/tasks"))) == 3


# ------------------------------------------------------------------ habits


def test_habit_completion_is_unique_per_day(api, today):
    h = api.ok(api.c.post("/api/habits", json={"name": "Read",
                                               "start_date": (today - timedelta(days=10)).isoformat()}))
    for _ in range(3):
        h = api.ok(api.c.put(f"/api/habits/{h['id']}/completions", json={"date": today.isoformat(), "done": True}))
    assert h["total_completions"] == 1 and h["done_today"] is True
    h = api.ok(api.c.put(f"/api/habits/{h['id']}/completions", json={"date": today.isoformat(), "done": False}))
    assert h["total_completions"] == 0


def test_habit_rejects_future_and_pre_start_dates(api, today):
    h = api.ok(api.c.post("/api/habits", json={"name": "Read", "start_date": today.isoformat()}))
    future = api.c.put(f"/api/habits/{h['id']}/completions",
                       json={"date": (today + timedelta(days=1)).isoformat(), "done": True})
    assert future.status_code == 422
    before = api.c.put(f"/api/habits/{h['id']}/completions",
                       json={"date": (today - timedelta(days=1)).isoformat(), "done": True})
    assert before.status_code == 422


def test_weekday_habit_requires_days(api):
    assert api.c.post("/api/habits", json={"name": "Gym", "schedule": "weekdays"}).status_code == 422
    h = api.ok(api.c.post("/api/habits", json={"name": "Gym", "schedule": "weekdays", "weekdays": [0, 2, 4]}))
    assert h["weekdays"] == [0, 2, 4]


def test_streaks_count_scheduled_days_only():
    monday = date(2026, 3, 2)
    habit = Habit(schedule="weekdays", weekday_mask=0b10101, start_date=monday - timedelta(days=14))  # Mon/Wed/Fri
    done = {monday - timedelta(days=d) for d in (14, 12, 10, 7, 5, 3)}  # every M/W/F for 2 weeks, gap? no
    done.discard(monday - timedelta(days=10))  # miss Friday two weeks ago
    current, longest = streaks(habit, done, monday)
    # today (Mon) is scheduled but not yet done -> not counted, doesn't break the streak
    assert current == 3
    assert longest == 3
    daily = Habit(schedule="daily", weekday_mask=0, start_date=monday - timedelta(days=5))
    assert streaks(daily, {monday - timedelta(days=d) for d in range(0, 6)}, monday) == (6, 6)
    assert streaks(daily, set(), monday) == (0, 0)


def test_habit_rates(api, today):
    h = api.ok(api.c.post("/api/habits", json={"name": "Walk",
                                               "start_date": (today - timedelta(days=9)).isoformat()}))
    for d in range(0, 7, 2):  # 4 of the last 7 days
        api.ok(api.c.put(f"/api/habits/{h['id']}/completions",
                         json={"date": (today - timedelta(days=d)).isoformat(), "done": True}))
    h = api.ok(api.c.get("/api/habits"))[0]
    assert h["week_rate"] == "57.1"
    assert h["all_time_rate"] == "40.0"  # 4 of 10 days
