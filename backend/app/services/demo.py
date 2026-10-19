"""Clearly labelled demonstration data.

Every demo record has is_demo = true and demo account names start with "Demo ·".
The figures are invented for illustration and are NOT the owner's information.
`remove_demo` deletes all of it in one go.
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import Conflict
from app.models import (
    Account,
    BudgetLimit,
    Category,
    Goal,
    Habit,
    HabitCompletion,
    InstallmentPayment,
    InstallmentPlan,
    Project,
    RecurringRule,
    Task,
    Transaction,
)
from app.schemas.finance import (
    AccountCreate,
    BudgetSet,
    InstallmentCreate,
    InstallmentPaymentCreate,
    RecurringCreate,
    TransactionCreate,
)
from app.schemas.planning import GoalCreate, HabitCreate, MilestoneIn, ProjectCreate, TaskCreate
from app.services import accounts, budgets, goals, habits, installments, recurring, tasks
from app.services.categories import ensure_default_categories
from app.services.dates import add_months, month_start, today_for
from app.services.transactions import create_transaction

PREFIX = "Demo · "


def has_demo(db: Session) -> bool:
    return bool(db.scalar(select(func.count()).select_from(Account).where(Account.is_demo.is_(True))))


def seed_demo(db: Session) -> dict:
    if has_demo(db):
        raise Conflict("Demo data is already loaded")
    ensure_default_categories(db)
    rng = random.Random(42)
    today = today_for(db)
    start = add_months(month_start(today), -4)
    cats = {c.name: c for c in db.scalars(select(Category))}

    def cat(name: str) -> int:
        return cats[name].id

    bank = accounts.create_account(db, AccountCreate(name=PREFIX + "Main card", type="bank",
                                                     opening_balance=Decimal("350000"), opening_date=start),
                                   is_demo=True)
    cash = accounts.create_account(db, AccountCreate(name=PREFIX + "Cash", type="cash",
                                                     opening_balance=Decimal("60000"), opening_date=start),
                                   is_demo=True)
    savings = accounts.create_account(db, AccountCreate(name=PREFIX + "Savings deposit", type="savings",
                                                        opening_balance=Decimal("500000"), opening_date=start),
                                      is_demo=True)

    def tx(**kw):
        create_transaction(db, TransactionCreate(**kw), is_demo=True, commit=False)

    m = start
    while m <= today:
        if m.replace(day=5) <= today:
            tx(type="income", amount=Decimal("650000"), date=m.replace(day=5), account_id=bank.id,
               category_id=cat("Salary"), description="Monthly salary")
        if m.replace(day=20) <= today and m.month % 2 == 0:
            tx(type="income", amount=Decimal(rng.randrange(60, 150) * 1000), date=m.replace(day=20),
               account_id=bank.id, category_id=cat("Freelance income"), description="Freelance project")
        if m.replace(day=6) <= today:
            tx(type="transfer", amount=Decimal("100000"), date=m.replace(day=6), account_id=bank.id,
               to_account_id=savings.id, description="Monthly savings")
            tx(type="expense", amount=Decimal("180000"), date=m.replace(day=6), account_id=bank.id,
               category_id=cat("Housing and utilities"), description="Rent")
        for day in range(1, 29):
            d = m.replace(day=day)
            if d > today:
                break
            if rng.random() < 0.45:
                tx(type="expense", amount=Decimal(rng.randrange(25, 140) * 100), date=d, account_id=bank.id,
                   category_id=cat("Food and groceries"), description="Groceries", payee="Supermarket")
            if rng.random() < 0.3:
                tx(type="expense", amount=Decimal(rng.randrange(15, 60) * 100), date=d,
                   account_id=cash.id if rng.random() < 0.15 else bank.id,
                   category_id=cat("Restaurants and coffee"), description="Coffee / lunch")
            if rng.random() < 0.25:
                tx(type="expense", amount=Decimal(rng.randrange(4, 30) * 100), date=d, account_id=bank.id,
                   category_id=cat("Transport"), description="Taxi / bus")
            if rng.random() < 0.06:
                tx(type="expense", amount=Decimal(rng.randrange(50, 400) * 100), date=d, account_id=bank.id,
                   category_id=cat("Shopping"), description="Shopping")
        m = add_months(m, 1)
    db.commit()

    for name, amount in (("Food and groceries", "90000"), ("Restaurants and coffee", "35000"),
                         ("Transport", "20000"), ("Shopping", "40000")):
        budgets.set_budget(db, BudgetSet(category_id=cat(name), month=start.strftime("%Y-%m"),
                                         amount=Decimal(amount)), is_demo=True)

    sub_start = start.replace(day=12)
    rule = recurring.create_rule(db, RecurringCreate(name=PREFIX + "Music streaming", type="expense",
                                                     amount=Decimal("1990"), frequency="monthly",
                                                     start_date=sub_start, account_id=bank.id,
                                                     category_id=cat("Subscriptions")), is_demo=True)
    for d in recurring.pending_occurrences(db, rule, today - timedelta(days=1)):
        recurring.confirm_occurrence(db, rule.id, recurring.ConfirmOccurrence(occurrence_date=d))
    recurring.create_rule(db, RecurringCreate(name=PREFIX + "Gym membership", type="expense",
                                              amount=Decimal("15000"), frequency="monthly",
                                              start_date=today + timedelta(days=3), account_id=bank.id,
                                              category_id=cat("Health and fitness")), is_demo=True)

    plan = installments.create_plan(db, InstallmentCreate(
        name=PREFIX + "Laptop 0-0-12", lender="Demo store", original_amount=Decimal("480000"),
        payment_amount=Decimal("40000"), frequency="monthly", next_payment_date=start.replace(day=15),
        default_account_id=bank.id, notes="Demo installment plan"), is_demo=True)
    d = start.replace(day=15)
    while d < today:
        installments.record_payment(db, plan.id, InstallmentPaymentCreate(date=d, amount=Decimal("40000"),
                                                                          account_id=bank.id))
        d = add_months(d, 1)

    g1 = goals.create_goal(db, GoalCreate(title=PREFIX + "Emergency fund: 6 months", category="finance",
                                          progress_mode="target", target_value=Decimal("2000000"),
                                          current_value=Decimal("900000"), unit="KZT",
                                          target_date=add_months(today, 8)), is_demo=True)
    g2 = goals.create_goal(db, GoalCreate(title=PREFIX + "Play 10 songs on guitar", category="creative",
                                          progress_mode="milestones", target_date=add_months(today, 4),
                                          milestones=[MilestoneIn(title=f"Song {i}") for i in range(1, 11)]),
                           is_demo=True)
    for ms in g2.milestones[:3]:
        goals.update_milestone(db, g2.id, ms.id, goals.MilestoneUpdate(completed=True))
    p = goals.create_project(db, ProjectCreate(title=PREFIX + "Learn barre chords", goal_id=g2.id), is_demo=True)
    goals.create_goal(db, GoalCreate(title=PREFIX + "Finish online course", category="career",
                                     manual_progress=40, target_date=add_months(today, 2)), is_demo=True)

    for title, due, prio, extra in (
        ("Review monthly budget", today, "high", {"category": "finance"}),
        ("Practice F-major barre", today, "medium", {"project_id": p.id, "recurrence": "daily"}),
        ("Pay utilities", today - timedelta(days=2), "urgent", {"category": "finance"}),
        ("Book dentist appointment", today + timedelta(days=3), "low", {"category": "health"}),
        ("Plan next week", today + timedelta(days=5), "medium", {}),
        ("Transfer to emergency fund", today + timedelta(days=1), "high", {"goal_id": g1.id}),
    ):
        tasks.create_task(db, TaskCreate(title=PREFIX + title, due_date=due, priority=prio, **extra), is_demo=True)

    habit_defs = (("Read 20 minutes", "daily", [], "#7c9cff", 0.75), ("Guitar practice", "daily", [], "#f59e0b", 0.6),
                  ("Workout", "weekdays", [0, 2, 4], "#34d399", 0.7), ("Sleep by 23:30", "daily", [], "#a78bfa", 0.5))
    for name, schedule, wd, color, p_done in habit_defs:
        h = habits.create_habit(db, HabitCreate(name=PREFIX + name, schedule=schedule, weekdays=wd, color=color,
                                                start_date=today - timedelta(days=75)), is_demo=True)
        for i in range(1, 76):
            day = today - timedelta(days=i)
            if habits.is_scheduled(h, day) and rng.random() < p_done:
                db.add(HabitCompletion(habit_id=h.id, date=day))
    db.commit()
    return {"seeded": True}


def remove_demo(db: Session) -> dict:
    """Delete every is_demo record. Real records are never touched; a demo account that
    received real transactions is kept and reported."""
    demo_plan_ids = select(InstallmentPlan.id).where(InstallmentPlan.is_demo.is_(True))
    pay_tx_ids = [t for t in db.scalars(select(InstallmentPayment.transaction_id)
                                        .where(InstallmentPayment.plan_id.in_(demo_plan_ids))) if t]
    db.query(InstallmentPayment).filter(InstallmentPayment.plan_id.in_(demo_plan_ids)).delete(
        synchronize_session=False)
    if pay_tx_ids:
        db.query(Transaction).filter(Transaction.id.in_(pay_tx_ids)).delete(synchronize_session=False)
    counts = {"transactions": db.query(Transaction).filter(Transaction.is_demo.is_(True)).delete(
        synchronize_session=False) + len(pay_tx_ids)}
    counts["installment_plans"] = db.query(InstallmentPlan).filter(InstallmentPlan.is_demo.is_(True)).delete(
        synchronize_session=False)
    demo_rule_ids = select(RecurringRule.id).where(RecurringRule.is_demo.is_(True))
    db.query(Transaction).filter(Transaction.recurring_rule_id.in_(demo_rule_ids)).update(
        {"recurring_rule_id": None, "recurring_occurrence_date": None}, synchronize_session=False)
    counts["recurring_rules"] = db.query(RecurringRule).filter(RecurringRule.is_demo.is_(True)).delete(
        synchronize_session=False)
    counts["budgets"] = db.query(BudgetLimit).filter(BudgetLimit.is_demo.is_(True)).delete(
        synchronize_session=False)
    counts["tasks"] = db.query(Task).filter(Task.is_demo.is_(True)).delete(synchronize_session=False)
    counts["projects"] = db.query(Project).filter(Project.is_demo.is_(True)).delete(synchronize_session=False)
    for g in db.scalars(select(Goal).where(Goal.is_demo.is_(True))):
        db.delete(g)
    for h in db.scalars(select(Habit).where(Habit.is_demo.is_(True))):
        db.delete(h)
    kept = []
    removed_accounts = 0
    for acc in db.scalars(select(Account).where(Account.is_demo.is_(True))):
        in_use = db.scalar(select(func.count()).where(
            or_(Transaction.account_id == acc.id, Transaction.to_account_id == acc.id)))
        in_use += db.scalar(select(func.count()).where(RecurringRule.account_id == acc.id))
        if in_use:
            kept.append(acc.name)
        else:
            db.query(InstallmentPlan).filter(InstallmentPlan.default_account_id == acc.id).update(
                {"default_account_id": None}, synchronize_session=False)
            db.delete(acc)
            removed_accounts += 1
    counts["accounts"] = removed_accounts
    db.commit()
    return {"removed": counts, "kept_accounts": kept}
