"""Monthly category budgets, computed from actual expense transactions only.

Transfers are excluded by construction (they have no category and are not of type
'expense'). Budgets are denominated in the primary currency; expenses recorded in
other-currency accounts are not mixed in.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ValidationFailed
from app.models import Account, BudgetLimit, Category, Transaction
from app.schemas.finance import BudgetSet
from app.services.dates import add_months, month_end, month_start, parse_month
from app.services.money import ZERO, percent, q
from app.services.settings import get_app_settings

WARNING_THRESHOLD = Decimal("85")


def spending_by_category(db: Session, start: date, end: date, currency: str) -> dict[int, Decimal]:
    stmt = (
        select(Transaction.category_id, func.sum(Transaction.amount))
        .join(Account, Account.id == Transaction.account_id)
        .where(
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
            Account.currency == currency,
        )
        .group_by(Transaction.category_id)
    )
    return {cid: q(total) for cid, total in db.execute(stmt)}


def effective_limits(db: Session, month: date) -> dict[int, BudgetLimit]:
    """For each category, the newest budget row effective on/before `month`, if active."""
    rows = db.scalars(
        select(BudgetLimit).where(BudgetLimit.effective_month <= month).order_by(BudgetLimit.effective_month)
    )
    latest: dict[int, BudgetLimit] = {}
    for row in rows:
        latest[row.category_id] = row
    return {cid: row for cid, row in latest.items() if row.is_active}


def first_transaction_date(db: Session) -> date | None:
    return db.scalar(select(func.min(Transaction.date)))


def budget_month(db: Session, month: date) -> dict:
    month = month_start(month)
    currency = get_app_settings(db).primary_currency
    limits = effective_limits(db, month)
    spent = spending_by_category(db, month, month_end(month), currency)
    prev = add_months(month, -1)
    prev_spent = spending_by_category(db, prev, month_end(prev), currency)

    # 3-month average only when the data actually covers those three full months.
    first = first_transaction_date(db)
    avg_3m: dict[int, Decimal] | None = None
    three_back = add_months(month, -3)
    if first and first <= three_back:
        sums: dict[int, Decimal] = defaultdict(lambda: ZERO)
        for k, v in spending_by_category(db, three_back, month_end(prev), currency).items():
            sums[k] += v
        avg_3m = {k: q(v / 3) for k, v in sums.items()}

    lines = []
    for cid, limit_row in limits.items():
        cat = db.get(Category, cid)
        s = spent.get(cid, ZERO)
        util = percent(s, limit_row.amount)
        if s > limit_row.amount:
            status = "over"
        elif util is not None and util >= WARNING_THRESHOLD:
            status = "warning"
        else:
            status = "ok"
        lines.append(
            {
                "category_id": cid,
                "category_name": cat.name,
                "color": cat.color,
                "limit": q(limit_row.amount),
                "spent": s,
                "remaining": q(limit_row.amount - s),
                "utilization": util,
                "status": status,
                "effective_since": limit_row.effective_month.strftime("%Y-%m"),
                "previous_month_spent": prev_spent.get(cid, ZERO),
                "average_3m_spent": (avg_3m or {}).get(cid, ZERO) if avg_3m is not None else None,
            }
        )
    lines.sort(key=lambda line: (-(line["utilization"] or Decimal(0)), line["category_name"]))
    budgeted_ids = set(limits)
    return {
        "month": month.strftime("%Y-%m"),
        "currency": currency,
        "lines": lines,
        "total_limit": q(sum((line["limit"] for line in lines), ZERO)),
        "total_spent_budgeted": q(sum((line["spent"] for line in lines), ZERO)),
        "unbudgeted_spent": q(sum((v for k, v in spent.items() if k not in budgeted_ids), ZERO)),
        "note": f"Actual {currency} expenses only. Transfers and expected (unconfirmed) payments are excluded.",
    }


def set_budget(db: Session, data: BudgetSet, *, is_demo: bool = False) -> BudgetLimit:
    try:
        month = parse_month(data.month)
    except ValueError as exc:
        raise ValidationFailed(str(exc)) from exc
    cat = db.get(Category, data.category_id)
    if cat is None or cat.kind != "expense":
        raise ValidationFailed("Budgets can only be set on existing expense categories")
    row = db.scalar(
        select(BudgetLimit).where(BudgetLimit.category_id == cat.id, BudgetLimit.effective_month == month)
    )
    if row is None:
        row = BudgetLimit(category_id=cat.id, effective_month=month, is_demo=is_demo)
        db.add(row)
    row.amount = q(data.amount)
    row.is_active = data.is_active
    db.commit()
    return row
