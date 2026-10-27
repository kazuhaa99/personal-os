"""The ownership check on links (account_id, category_id, …) is one query per linked table and
flush, not one per row: importing thousands of transactions must not mean thousands of lookups."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import event, select

from app.db import engine
from app.errors import NotFound
from app.models import Account, Category, Transaction


def _selects_during(db, action) -> int:
    count = 0

    def on_execute(conn, cursor, statement, *_):
        nonlocal count
        count += statement.lstrip().upper().startswith("SELECT")

    event.listen(engine, "before_cursor_execute", on_execute)
    try:
        action()
    finally:
        event.remove(engine, "before_cursor_execute", on_execute)
    return count


def _account_and_category(db):
    acc = Account(name="Main", type="bank", currency="KZT", opening_balance=Decimal("0"), opening_date=date(2026, 1, 1))
    db.add(acc)
    db.commit()
    cat = db.scalars(select(Category).where(Category.kind == "expense")).first()
    return acc, cat


def test_many_new_rows_are_checked_in_a_few_queries(db):
    acc, cat = _account_and_category(db)
    db.add_all(Transaction(type="expense", amount=Decimal("1"), date=date(2026, 3, 1), account_id=acc.id,
                           category_id=cat.id, description=f"#{i}") for i in range(200))
    assert _selects_during(db, db.flush) <= 4
    db.rollback()


def test_a_link_to_a_missing_or_foreign_row_is_still_refused(db):
    acc, cat = _account_and_category(db)
    db.add_all([Transaction(type="expense", amount=Decimal("1"), date=date(2026, 3, 1), account_id=acc.id, category_id=cat.id),
                Transaction(type="expense", amount=Decimal("1"), date=date(2026, 3, 1), account_id=999_999, category_id=cat.id)])
    with pytest.raises(NotFound, match="Account 999999 not found"):
        db.flush()
    db.rollback()
