"""Read-only financial analytics. All figures are *actual* (recorded transactions)
unless a field name says otherwise. Transfers never count as income or expense.

Terminology used in responses:
- net_cash_flow: income - expenses over a period (not the same as a balance change
  when opening balances or transfers to untracked accounts are involved).
- balance: money held in tracked accounts at a point in time.
- savings_balance: balance of accounts of type 'savings'.
- outstanding_liabilities: unpaid amounts of tracked installment plans.
Total balance is never labelled net worth: assets other than accounts are not tracked.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, Category, InstallmentPlan, Transaction
from app.services import installments as inst
from app.services.accounts import balances
from app.services.budgets import effective_limits, spending_by_category
from app.services.dates import add_months, month_end, month_start, months_between
from app.services.money import ZERO, percent, q


def _monthly_flows(db: Session, start: date, end: date, currency: str) -> dict[tuple[date, str], Decimal]:
    m = func.date_trunc("month", Transaction.date)
    stmt = (
        select(m, Transaction.type, func.sum(Transaction.amount))
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.type.in_(("income", "expense")), Transaction.date >= start, Transaction.date <= end,
               Account.currency == currency)
        .group_by(m, Transaction.type)
    )
    return {(row[0].date(), row[1]): q(row[2]) for row in db.execute(stmt)}


def cash_flow(db: Session, start_month: date, end_month: date, currency: str) -> dict:
    start, end = month_start(start_month), month_end(end_month)
    flows = _monthly_flows(db, start, end, currency)
    months = []
    for m in months_between(start, end):
        inc, exp = flows.get((m, "income"), ZERO), flows.get((m, "expense"), ZERO)
        months.append({
            "month": m.strftime("%Y-%m"),
            "income": inc,
            "expense": exp,
            "net_cash_flow": q(inc - exp),
            "savings_rate": percent(inc - exp, inc),
            "has_data": (m, "income") in flows or (m, "expense") in flows,
        })
    tot_inc = q(sum((x["income"] for x in months), ZERO))
    tot_exp = q(sum((x["expense"] for x in months), ZERO))
    with_data = [x for x in months if x["has_data"]]
    return {
        "currency": currency,
        "months": months,
        "total_income": tot_inc,
        "total_expense": tot_exp,
        "net_cash_flow": q(tot_inc - tot_exp),
        "months_with_data": len(with_data),
        "average_monthly_expense": q(sum((x["expense"] for x in with_data), ZERO) / len(with_data))
        if with_data else None,
    }


def category_breakdown(db: Session, start: date, end: date, currency: str, kind: str = "expense") -> dict:
    stmt = (
        select(Category.id, Category.name, Category.color, func.sum(Transaction.amount), func.count())
        .join(Category, Category.id == Transaction.category_id)
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.type == kind, Transaction.date >= start, Transaction.date <= end,
               Account.currency == currency)
        .group_by(Category.id, Category.name, Category.color)
        .order_by(func.sum(Transaction.amount).desc())
    )
    rows = db.execute(stmt).all()
    total = q(sum((r[3] for r in rows), ZERO))
    return {
        "currency": currency,
        "kind": kind,
        "total": total,
        "categories": [
            {"category_id": r[0], "name": r[1], "color": r[2], "amount": q(r[3]), "count": r[4],
             "share": percent(r[3], total)}
            for r in rows
        ],
    }


def expense_trend(db: Session, start_month: date, end_month: date, currency: str, top: int = 5) -> dict:
    """Monthly expenses for the top categories of the period; the rest grouped as 'Other'."""
    start, end = month_start(start_month), month_end(end_month)
    breakdown = category_breakdown(db, start, end, currency)
    top_cats = breakdown["categories"][:top]
    top_ids = {c["category_id"] for c in top_cats}
    m = func.date_trunc("month", Transaction.date)
    stmt = (
        select(m, Transaction.category_id, func.sum(Transaction.amount))
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.type == "expense", Transaction.date >= start, Transaction.date <= end,
               Account.currency == currency)
        .group_by(m, Transaction.category_id)
    )
    data: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for month_dt, cid, total in db.execute(stmt):
        key = str(cid) if cid in top_ids else "other"
        data[month_dt.date().strftime("%Y-%m")][key] += q(total)
    series = [{"key": str(c["category_id"]), "name": c["name"], "color": c["color"]} for c in top_cats]
    if len(breakdown["categories"]) > top:
        series.append({"key": "other", "name": "All other", "color": "#6b7280"})
    return {
        "currency": currency,
        "series": series,
        "months": [
            {"month": mm.strftime("%Y-%m"), **{s["key"]: data[mm.strftime("%Y-%m")].get(s["key"], ZERO) for s in series}}
            for mm in months_between(start, end)
        ],
    }


def balance_history(db: Session, start_month: date, end_month: date, currency: str, today: date) -> dict:
    """End-of-month balances (or today's, for the current month)."""
    accounts = [a for a in db.scalars(select(Account)) if a.currency == currency]
    points = []
    for m in months_between(start_month, end_month):
        as_of = min(month_end(m), today)
        if as_of < m:
            break
        bal = balances(db, as_of)
        total = q(sum((bal[a.id] for a in accounts), ZERO))
        savings = q(sum((bal[a.id] for a in accounts if a.type == "savings"), ZERO))
        points.append({"month": m.strftime("%Y-%m"), "as_of": as_of, "total_balance": total,
                       "savings_balance": savings})
    return {"currency": currency, "points": points}


def budget_performance(db: Session, start_month: date, end_month: date, currency: str) -> dict:
    out = []
    for m in months_between(start_month, end_month):
        limits = effective_limits(db, m)
        if not limits:
            out.append({"month": m.strftime("%Y-%m"), "limit": None, "spent": None, "over_count": 0})
            continue
        spent = spending_by_category(db, m, month_end(m), currency)
        total_limit = q(sum((r.amount for r in limits.values()), ZERO))
        total_spent = q(sum((spent.get(cid, ZERO) for cid in limits), ZERO))
        over = sum(1 for cid, r in limits.items() if spent.get(cid, ZERO) > r.amount)
        out.append({"month": m.strftime("%Y-%m"), "limit": total_limit, "spent": total_spent, "over_count": over})
    return {"currency": currency, "months": out}


def liabilities(db: Session) -> list[dict]:
    totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for plan in db.scalars(select(InstallmentPlan).where(InstallmentPlan.status.in_(("active", "paused")))):
        totals[plan.currency] += inst.outstanding(plan)
    return [{"currency": c, "amount": q(v)} for c, v in sorted(totals.items())]


def default_range(today: date, months: int = 6) -> tuple[date, date]:
    return add_months(month_start(today), -(months - 1)), month_start(today)
