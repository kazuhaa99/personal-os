"""Recurring payment rules.

A rule describes *expected* money movement. Nothing is posted automatically:
the owner confirms an occurrence, which creates exactly one transaction tagged with
(rule_id, occurrence_date). A unique constraint on that pair makes confirming the
same occurrence twice impossible, so re-processing a schedule is always safe.
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import Category, RecurringRule, Transaction
from app.schemas.finance import ConfirmOccurrence, RecurringCreate, RecurringUpdate, TransactionCreate
from app.services.accounts import require_usable_account
from app.services.dates import next_occurrence_after, occurrences, periods_per_year, today_for
from app.services.money import q
from app.services.transactions import create_transaction


def _check_refs(db: Session, rule_type: str, account_id: int, category_id: int) -> None:
    require_usable_account(db, account_id)
    cat = db.get(Category, category_id)
    if cat is None or cat.kind != rule_type:
        raise ValidationFailed(f"Choose an existing {rule_type} category")


def monthly_equivalent(rule: RecurringRule) -> Decimal:
    return q(rule.amount * periods_per_year(rule.frequency) / 12)


def _confirmed_dates(db: Session, rule_id: int) -> set[date]:
    return set(
        db.scalars(select(Transaction.recurring_occurrence_date).where(Transaction.recurring_rule_id == rule_id))
    )


def confirmed_counts(db: Session) -> dict[int, int]:
    """Recorded transactions per rule, for all rules in one query."""
    rows = db.execute(select(Transaction.recurring_rule_id, func.count())
                      .where(Transaction.recurring_rule_id.is_not(None)).group_by(Transaction.recurring_rule_id))
    return dict(rows.tuples().all())


def serialize(db: Session, rule: RecurringRule, confirmed: int | None = None) -> dict:
    """`confirmed`: the rule's count from confirmed_counts, when serializing many rules."""
    if confirmed is None:
        confirmed = db.scalar(select(func.count()).where(Transaction.recurring_rule_id == rule.id))
    return {
        "id": rule.id,
        "name": rule.name,
        "type": rule.type,
        "amount": rule.amount,
        "currency": rule.account.currency,
        "frequency": rule.frequency,
        "start_date": rule.start_date,
        "next_due_date": rule.next_due_date,
        "end_date": rule.end_date,
        "account": rule.account,
        "category": rule.category,
        "payee": rule.payee,
        "is_active": rule.is_active,
        "is_demo": rule.is_demo,
        "monthly_equivalent": monthly_equivalent(rule),
        "confirmed_count": confirmed,
    }


def get_rule(db: Session, rule_id: int) -> RecurringRule:
    rule = db.get(RecurringRule, rule_id)
    if rule is None:
        raise NotFound(f"Recurring rule {rule_id} not found")
    return rule


def list_rules(db: Session) -> list[RecurringRule]:
    return list(db.scalars(select(RecurringRule).order_by(RecurringRule.is_active.desc(),
                                                          RecurringRule.next_due_date)).unique())


def create_rule(db: Session, data: RecurringCreate, *, is_demo: bool = False) -> RecurringRule:
    _check_refs(db, data.type, data.account_id, data.category_id)
    rule = RecurringRule(**data.model_dump(), next_due_date=data.start_date, is_demo=is_demo)
    rule.amount = q(rule.amount)
    db.add(rule)
    db.commit()
    return rule


def update_rule(db: Session, rule_id: int, data: RecurringUpdate) -> RecurringRule:
    rule = get_rule(db, rule_id)
    fields = data.model_dump(exclude_unset=True)
    if "account_id" in fields or "category_id" in fields:
        _check_refs(db, rule.type, fields.get("account_id") or rule.account_id,
                    fields.get("category_id") or rule.category_id)
    if fields.get("account_id") and not fields.get("amount"):
        _require_same_currency(db, rule, fields["account_id"])
    for key in ("name", "amount", "account_id", "category_id", "is_active"):
        if key in fields and fields[key] is None:
            fields.pop(key)
    if "end_date" in fields and fields["end_date"] and fields["end_date"] < rule.start_date:
        raise ValidationFailed("end_date must not be before start_date")
    old_end = rule.end_date
    for key, value in fields.items():
        setattr(rule, key, q(value) if key == "amount" else value)
    if rule.end_date and rule.next_due_date and rule.next_due_date > rule.end_date:
        rule.next_due_date = None
    elif rule.next_due_date is None and old_end is not None and "next_due_date" not in fields \
            and (rule.end_date is None or rule.end_date > old_end):
        # A finished schedule got longer: everything up to the old end was handled already.
        rule.next_due_date = _next_open(db, rule, after=old_end)
    db.commit()
    db.refresh(rule)  # sessions keep objects after commit: reload the (possibly new) account and category
    return rule


def delete_rule(db: Session, rule_id: int) -> None:
    """Deletes the rule; confirmed transactions remain (their link is set to NULL)."""
    rule = get_rule(db, rule_id)
    db.query(Transaction).filter(Transaction.recurring_rule_id == rule.id).update(
        {"recurring_rule_id": None, "recurring_occurrence_date": None}
    )
    db.delete(rule)
    db.commit()


def _confirmed_dates_by_rule(db: Session) -> dict[int, set[date]]:
    """Confirmed occurrence dates of every rule, in one query."""
    out: dict[int, set[date]] = {}
    rows = db.execute(select(Transaction.recurring_rule_id, Transaction.recurring_occurrence_date)
                      .where(Transaction.recurring_rule_id.is_not(None)))
    for rule_id, day in rows:
        out.setdefault(rule_id, set()).add(day)
    return out


def pending_occurrences(db: Session, rule: RecurringRule, until: date, confirmed: set[date] | None = None) -> list[date]:
    """Expected, not-yet-confirmed occurrences from next_due_date up to `until`. `confirmed`: the
    rule's dates from _confirmed_dates_by_rule, when going through many rules."""
    if not rule.is_active or rule.next_due_date is None:
        return []
    if confirmed is None:
        confirmed = _confirmed_dates(db, rule.id)
    return [
        d
        for d in occurrences(rule.start_date, rule.frequency, after=rule.next_due_date - timedelta(days=1),
                             until=until, end=rule.end_date)
        if d not in confirmed
    ]


def _is_valid_occurrence(rule: RecurringRule, d: date) -> bool:
    return any(o == d for o in occurrences(rule.start_date, rule.frequency, after=d - timedelta(days=1),
                                           until=d, end=rule.end_date))


def _advance(db: Session, rule: RecurringRule, handled: date) -> None:
    """Move next_due_date past `handled` only if `handled` *is* the next due occurrence,
    so confirming a later occurrence early never hides earlier unconfirmed ones."""
    if rule.next_due_date is not None and handled == rule.next_due_date:
        rule.next_due_date = _next_open(db, rule, after=handled)


def _next_open(db: Session, rule: RecurringRule, after: date) -> date | None:
    """First occurrence after `after` that isn't confirmed yet, or None once the schedule ends."""
    confirmed = _confirmed_dates(db, rule.id)
    nxt = next_occurrence_after(rule.start_date, rule.frequency, after, rule.end_date)
    while nxt is not None and nxt in confirmed:
        nxt = next_occurrence_after(rule.start_date, rule.frequency, nxt, rule.end_date)
    return nxt


def _require_same_currency(db: Session, rule: RecurringRule, account_id: int) -> None:
    """The rule's amount is in its account's currency: another currency needs its own amount."""
    acc = require_usable_account(db, account_id)
    if acc.currency != rule.account.currency:
        raise ValidationFailed(f"'{acc.name}' is in {acc.currency}: enter the amount in {acc.currency}", code="currency_mismatch")


def confirm_occurrence(db: Session, rule_id: int, data: ConfirmOccurrence) -> Transaction:
    rule = get_rule(db, rule_id)
    if data.account_id and not data.amount:
        _require_same_currency(db, rule, data.account_id)
    if not _is_valid_occurrence(rule, data.occurrence_date):
        raise ValidationFailed(f"{data.occurrence_date} is not a scheduled date for '{rule.name}'")
    if data.occurrence_date in _confirmed_dates(db, rule.id):
        raise Conflict(f"The {data.occurrence_date} occurrence of '{rule.name}' is already recorded")
    try:
        tx = create_transaction(
            db,
            TransactionCreate(
                type=rule.type,
                amount=data.amount or rule.amount,
                date=data.actual_date or data.occurrence_date,
                account_id=data.account_id or rule.account_id,
                category_id=rule.category_id,
                description=rule.name,
                payee=rule.payee,
            ),
            recurring_rule_id=rule.id,
            occurrence_date=data.occurrence_date,
            is_demo=rule.is_demo,
            commit=False,
        )
        _advance(db, rule, data.occurrence_date)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflict(f"The {data.occurrence_date} occurrence of '{rule.name}' is already recorded") from exc
    return tx


def skip_occurrence(db: Session, rule_id: int, occurrence_date: date) -> RecurringRule:
    rule = get_rule(db, rule_id)
    if rule.next_due_date is None or occurrence_date != rule.next_due_date:
        raise ValidationFailed("Only the next due occurrence can be skipped")
    _advance(db, rule, occurrence_date)
    db.commit()
    return rule


def expected_payments(db: Session, days: int = 30, today: date | None = None) -> list[dict]:
    today = today or today_for(db)
    until = today + timedelta(days=days)
    out = []
    confirmed = _confirmed_dates_by_rule(db)
    for rule in list_rules(db):
        for d in pending_occurrences(db, rule, until, confirmed.get(rule.id, set())):
            out.append(
                {
                    "kind": "recurring",
                    "source_id": rule.id,
                    "name": rule.name,
                    "type": rule.type,
                    "amount": rule.amount,
                    "currency": rule.account.currency,
                    "due_date": d,
                    "overdue": d < today,
                    "account_name": rule.account.name,
                }
            )
    return out
