"""Deterministic insight rules.

Each rule inspects persisted data and emits zero or more insights that explain *why*
they appeared and link to the relevant screen. Rules that compare periods only fire
when there is enough history to make the comparison meaningful. Insights are
computed on demand; only dismissals are stored.

This module is the extension point for future AI-assisted analysis: such analysis
should consume the same structured data and produce the same Insight shape.
"""

from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, Goal, InsightDismissal, Task
from app.services import accounts as acc_svc
from app.services import installments as inst
from app.services import recurring
from app.services.budgets import budget_month, first_transaction_date, spending_by_category
from app.services.dates import add_months, month_start, today_for
from app.services.goals import compute_progress
from app.services.money import ZERO, percent, q
from app.services.settings import get_app_settings

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}

# Thresholds (documented so the user can reason about why something fired)
UPCOMING_DAYS = 7
GOAL_STALE_DAYS = 21
SPEND_INCREASE_PCT = Decimal("30")
SPEND_INCREASE_MIN_SHARE = Decimal("5")  # % of last month's total spend; ignores tiny categories


@dataclass
class Insight:
    key: str
    severity: str  # critical | warning | info
    category: str  # finance | tasks | goals
    title: str
    explanation: str
    link: str | None = None
    estimate: bool = False  # True when based on expected (not actual) figures


def _fmt(amount: Decimal, currency: str) -> str:
    return f"{q(amount):,.2f} {currency}".replace(",", " ")


def budget_rules(db: Session, today: date) -> list[Insight]:
    month = budget_month(db, today)
    out = []
    for line in month["lines"]:
        cur = month["currency"]
        if line["status"] == "over":
            out.append(Insight(
                key=f"budget-over:{line['category_id']}:{month['month']}", severity="critical", category="finance",
                title=f"{line['category_name']} is over budget",
                explanation=f"Spent {_fmt(line['spent'], cur)} of a {_fmt(line['limit'], cur)} monthly limit "
                            f"({_fmt(-line['remaining'], cur)} over) in {month['month']}.",
                link=f"/finances/budgets?month={month['month']}"))
        elif line["status"] == "warning":
            out.append(Insight(
                key=f"budget-warn:{line['category_id']}:{month['month']}", severity="warning", category="finance",
                title=f"{line['category_name']} budget is {line['utilization']}% used",
                explanation=f"{_fmt(line['remaining'], cur)} left of {_fmt(line['limit'], cur)} with "
                            f"{(add_months(month_start(today), 1) - today).days} day(s) remaining in the month.",
                link=f"/finances/budgets?month={month['month']}"))
    return out


def upcoming_payment_rules(db: Session, today: date) -> list[Insight]:
    out = []
    items = recurring.expected_payments(db, UPCOMING_DAYS, today) + inst.upcoming_installments(db, UPCOMING_DAYS, today)
    for p in items:
        if p["type"] != "expense":
            continue
        kind = "Installment" if p["kind"] == "installment" else "Recurring payment"
        link = "/finances/installments" if p["kind"] == "installment" else "/finances/recurring"
        if p["overdue"]:
            out.append(Insight(
                key=f"{p['kind']}-overdue:{p['source_id']}:{p['due_date']}", severity="critical", category="finance",
                title=f"{p['name']} was due {p['due_date'].strftime('%b %d')}",
                explanation=f"{kind} of {_fmt(p['amount'], p['currency'])} expected on {p['due_date']} has not been "
                            "recorded yet. Confirm it once paid, or skip it if it did not happen.",
                link=link, estimate=True))
        else:
            days = (p["due_date"] - today).days
            when = "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"
            out.append(Insight(
                key=f"{p['kind']}-due:{p['source_id']}:{p['due_date']}", severity="info", category="finance",
                title=f"{p['name']} due {when}",
                explanation=f"Expected {kind.lower()} of {_fmt(p['amount'], p['currency'])} on {p['due_date']}.",
                link=link, estimate=True))
    return out


def cash_coverage_rule(db: Session, today: date) -> list[Insight]:
    """Expected outflows in the next 14 days vs. currently available cash (estimate)."""
    window = 14
    due: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for p in recurring.expected_payments(db, window, today) + inst.upcoming_installments(db, window, today):
        if p["type"] == "expense":
            due[p["currency"]] += p["amount"]
    if not due:
        return []
    cash = acc_svc.totals_by_currency(db)
    out = []
    for cur, amount in due.items():
        available = cash.get(cur, ZERO)
        if amount > available:
            out.append(Insight(
                key=f"cash-coverage:{cur}:{today}", severity="warning", category="finance",
                title=f"Upcoming payments exceed available {cur}",
                explanation=f"{_fmt(amount, cur)} of recurring and installment payments are expected in the next "
                            f"{window} days, while active {cur} accounts hold {_fmt(available, cur)}. "
                            "This is a projection: expected income is not included.",
                link="/finances/recurring", estimate=True))
    return out


def spending_increase_rule(db: Session, today: date) -> list[Insight]:
    """Month-to-date spending vs. the same days of last month, per category.

    Fires only if transaction history starts on or before the first day of last
    month, so a partially tracked month is never compared."""
    first = first_transaction_date(db)
    this_start = month_start(today)
    prev_start = add_months(this_start, -1)
    if first is None or first > prev_start or today.day < 7:
        return []
    currency = get_app_settings(db).primary_currency
    prev_same_day = min(add_months(today, -1), this_start - timedelta(days=1))
    now = spending_by_category(db, this_start, today, currency)
    before = spending_by_category(db, prev_start, prev_same_day, currency)
    prev_total = sum(before.values(), ZERO)
    if prev_total == 0:
        return []
    out = []
    for cid, amount in now.items():
        base = before.get(cid, ZERO)
        if base == 0 or (base * 100 / prev_total) < SPEND_INCREASE_MIN_SHARE:
            continue
        change = percent(amount - base, base)
        if change is not None and change >= SPEND_INCREASE_PCT:
            cat = db.get(Category, cid)
            out.append(Insight(
                key=f"spend-up:{cid}:{this_start:%Y-%m}", severity="info", category="finance",
                title=f"{cat.name} spending is up {change}%",
                explanation=f"{_fmt(amount, currency)} from {this_start:%b} 1–{today.day} vs "
                            f"{_fmt(base, currency)} over the same days last month.",
                link=f"/finances/transactions?category_id={cid}&start={this_start}&end={today}"))
    return out


def task_rules(db: Session, today: date) -> list[Insight]:
    overdue = list(db.scalars(select(Task).where(Task.status != "done", Task.due_date < today)
                              .order_by(Task.due_date)))
    if not overdue:
        return []
    oldest = overdue[0]
    return [Insight(
        key=f"tasks-overdue:{today}", severity="warning", category="tasks",
        title=f"{len(overdue)} overdue task{'s' if len(overdue) != 1 else ''}",
        explanation=f"Oldest: “{oldest.title}”, due {oldest.due_date}. Reschedule, complete, or delete what no "
                    "longer matters.",
        link="/tasks?view=overdue")]


def goal_rules(db: Session, today: date) -> list[Insight]:
    out = []
    now = datetime.now(timezone.utc)
    for goal in db.scalars(select(Goal).where(Goal.status == "active", Goal.archived_at.is_(None))):
        if goal.target_date and goal.target_date < today:
            out.append(Insight(
                key=f"goal-overdue:{goal.id}", severity="warning", category="goals",
                title=f"“{goal.title}” passed its target date",
                explanation=f"Target was {goal.target_date}; progress is {compute_progress(goal)}%. "
                            "Set a new date or mark it completed/paused.",
                link=f"/goals?goal={goal.id}"))
            continue
        last = goal.last_progress_at or goal.created_at
        if (now - goal.created_at).days >= GOAL_STALE_DAYS and (now - last).days >= GOAL_STALE_DAYS:
            out.append(Insight(
                key=f"goal-stale:{goal.id}:{last.date()}", severity="info", category="goals",
                title=f"No progress on “{goal.title}” in {(now - last).days} days",
                explanation=f"Last change was on {last.date()}. A small next step or a task linked to this goal "
                            "can restart momentum.",
                link=f"/goals?goal={goal.id}"))
    return out


RULES = [budget_rules, upcoming_payment_rules, cash_coverage_rule, spending_increase_rule, task_rules, goal_rules]


def compute(db: Session, today: date | None = None, include_dismissed: bool = False) -> list[dict]:
    today = today or today_for(db)
    items: list[Insight] = []
    for rule in RULES:
        items.extend(rule(db, today))
    dismissed = set(db.scalars(select(InsightDismissal.key)))
    if not include_dismissed:
        items = [i for i in items if i.key not in dismissed]
    items.sort(key=lambda i: (SEVERITY_ORDER[i.severity], i.category, i.title))
    return [{**asdict(i), "dismissed": i.key in dismissed} for i in items]


def dismiss(db: Session, key: str) -> None:
    if db.get(InsightDismissal, key) is None:
        db.add(InsightDismissal(key=key))
        db.commit()


def restore_all(db: Session) -> int:
    n = db.query(InsightDismissal).delete()
    db.commit()
    return n


def count_overdue_tasks(db: Session, today: date) -> int:
    return db.scalar(select(func.count()).where(Task.status != "done", Task.due_date < today)) or 0
