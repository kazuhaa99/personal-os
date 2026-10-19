"""Command Center: one response with everything the overview page needs.

Each top-level key is an independent widget payload, so new widgets can be added
without changing existing ones."""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.services import accounts, analytics, budgets, goals, habits, insights, installments, recurring, tasks
from app.services.dates import month_end, month_start, today_for
from app.services.money import ZERO, percent, q
from app.services.settings import get_app_settings


def build(db: Session) -> dict:
    settings = get_app_settings(db)
    today = today_for(db)
    currency = settings.primary_currency

    task_list = tasks.list_tasks(db, "today", today=today)
    upcoming = [t for t in tasks.list_tasks(db, "upcoming", today=today) if t.due_date <= today + timedelta(days=7)]

    habit_rows = [habits.serialize(db, h, today, history_days=7) for h in habits.list_habits(db)]
    scheduled = [h for h in habit_rows if h["scheduled_today"]]

    goal_rows = [goals.serialize(db, g, today) for g in goals.list_goals(db) if g.status == "active"]

    acc_rows = accounts.list_accounts(db, include_archived=False)
    cash_totals = accounts.totals_by_currency(db)

    flow = analytics.cash_flow(db, month_start(today), month_start(today), currency)["months"][0]
    budget = budgets.budget_month(db, today)

    expected = sorted(
        recurring.expected_payments(db, 30, today) + installments.upcoming_installments(db, 30, today),
        key=lambda p: p["due_date"],
    )
    expected_out = q(sum((p["amount"] for p in expected if p["type"] == "expense" and p["currency"] == currency),
                         ZERO))

    return {
        "today": today,
        "owner_name": settings.owner_name,
        "primary_currency": currency,
        "tasks": {
            "today": [tasks.serialize(t, today) for t in task_list],
            "upcoming": [tasks.serialize(t, today) for t in upcoming[:8]],
            "counts": tasks.counts(db, today),
        },
        "habits": {
            "items": habit_rows,
            "scheduled_today": len(scheduled),
            "done_today": sum(1 for h in scheduled if h["done_today"]),
        },
        "goals": goal_rows[:6],
        "accounts": {
            "items": acc_rows,
            "totals": [{"currency": c, "amount": v} for c, v in sorted(cash_totals.items())],
        },
        "month": {
            "label": today.strftime("%B %Y"),
            "start": month_start(today),
            "end": month_end(today),
            "currency": currency,
            "income": flow["income"],
            "expense": flow["expense"],
            "net_cash_flow": flow["net_cash_flow"],
        },
        "budget": {
            "total_limit": budget["total_limit"],
            "total_spent": budget["total_spent_budgeted"],
            "utilization": percent(budget["total_spent_budgeted"], budget["total_limit"]),
            "lines": budget["lines"][:6],
            "currency": currency,
        },
        "expected_payments": {
            "items": expected[:10],
            "total_expected_outflow_30d": expected_out,
            "note": "Expected, not yet recorded. Not included in actual balances or totals.",
        },
        "liabilities": analytics.liabilities(db),
        "insights": insights.compute(db, today)[:8],
    }
