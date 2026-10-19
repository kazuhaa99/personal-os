"""Accounts and derived balances.

balance(account, as_of) = opening_balance
                          + income into the account
                          - expenses from the account
                          - transfers out of the account
                          + transfers into the account
counting only transactions dated on/before `as_of`.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import Account, InstallmentPlan, RecurringRule, Transaction
from app.schemas.finance import AccountCreate, AccountUpdate
from app.services.dates import today_for
from app.services.money import ZERO, q


def _flows(db: Session, as_of: date | None = None) -> dict[int, Decimal]:
    """Net transaction flow per account id."""
    flows: dict[int, Decimal] = defaultdict(lambda: ZERO)
    date_filter = [Transaction.date <= as_of] if as_of else []

    signed = case(
        (Transaction.type == "income", Transaction.amount),
        else_=-Transaction.amount,  # expense or transfer-out
    )
    for account_id, total in db.execute(
        select(Transaction.account_id, func.sum(signed)).where(*date_filter).group_by(Transaction.account_id)
    ):
        flows[account_id] += total
    for account_id, total in db.execute(
        select(Transaction.to_account_id, func.sum(Transaction.amount))
        .where(Transaction.type == "transfer", *date_filter)
        .group_by(Transaction.to_account_id)
    ):
        flows[account_id] += total
    return flows


def balances(db: Session, as_of: date | None = None) -> dict[int, Decimal]:
    """Balance of every account. Accounts opened after `as_of` are reported at zero."""
    flows = _flows(db, as_of)
    out: dict[int, Decimal] = {}
    for acc in db.scalars(select(Account)):
        opening = acc.opening_balance if (as_of is None or acc.opening_date <= as_of) else ZERO
        out[acc.id] = q(opening + flows.get(acc.id, ZERO))
    return out


def balance_of(db: Session, account_id: int, as_of: date | None = None) -> Decimal:
    return balances(db, as_of).get(account_id, ZERO)


def totals_by_currency(db: Session, *, include_archived: bool = False, types: set[str] | None = None,
                       as_of: date | None = None) -> dict[str, Decimal]:
    """Sum of balances per currency. Different currencies are never added together."""
    bal = balances(db, as_of)
    out: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for acc in db.scalars(select(Account)):
        if acc.is_archived and not include_archived:
            continue
        if types and acc.type not in types:
            continue
        out[acc.currency] += bal[acc.id]
    return dict(out)


def _tx_counts(db: Session) -> dict[int, int]:
    counts: dict[int, int] = defaultdict(int)
    for account_id, n in db.execute(select(Transaction.account_id, func.count()).group_by(Transaction.account_id)):
        counts[account_id] += n
    for account_id, n in db.execute(
        select(Transaction.to_account_id, func.count())
        .where(Transaction.to_account_id.is_not(None))
        .group_by(Transaction.to_account_id)
    ):
        counts[account_id] += n
    return counts


def serialize(acc: Account, balance: Decimal, tx_count: int) -> dict:
    return {
        "id": acc.id,
        "name": acc.name,
        "type": acc.type,
        "currency": acc.currency,
        "opening_balance": acc.opening_balance,
        "opening_date": acc.opening_date,
        "current_balance": balance,
        "is_archived": acc.is_archived,
        "notes": acc.notes,
        "is_demo": acc.is_demo,
        "transaction_count": tx_count,
        "created_at": acc.created_at,
    }


def list_accounts(db: Session, include_archived: bool = True) -> list[dict]:
    stmt = select(Account).order_by(Account.is_archived, Account.type, Account.name)
    if not include_archived:
        stmt = stmt.where(Account.is_archived.is_(False))
    bal, counts = balances(db), _tx_counts(db)
    return [serialize(a, bal[a.id], counts.get(a.id, 0)) for a in db.scalars(stmt)]


def get_account(db: Session, account_id: int) -> Account:
    acc = db.get(Account, account_id)
    if acc is None:
        raise NotFound(f"Account {account_id} not found")
    return acc


def account_out(db: Session, acc: Account) -> dict:
    return serialize(acc, balance_of(db, acc.id), _tx_counts(db).get(acc.id, 0))


def _ensure_unique_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    stmt = select(Account.id).where(func.lower(Account.name) == name.lower())
    if exclude_id:
        stmt = stmt.where(Account.id != exclude_id)
    if db.scalar(stmt):
        raise Conflict(f"An account named '{name}' already exists")


def create_account(db: Session, data: AccountCreate, *, is_demo: bool = False) -> Account:
    _ensure_unique_name(db, data.name)
    acc = Account(
        name=data.name,
        type=data.type,
        currency=data.currency,
        opening_balance=q(data.opening_balance),
        opening_date=data.opening_date or today_for(db),
        notes=data.notes,
        is_demo=is_demo,
    )
    db.add(acc)
    db.commit()
    return acc


def update_account(db: Session, account_id: int, data: AccountUpdate) -> Account:
    acc = get_account(db, account_id)
    fields = data.model_dump(exclude_unset=True)
    if "name" in fields:
        _ensure_unique_name(db, fields["name"], exclude_id=acc.id)
    if "opening_date" in fields and fields["opening_date"] is not None:
        first = db.scalar(
            select(func.min(Transaction.date)).where(
                (Transaction.account_id == acc.id) | (Transaction.to_account_id == acc.id)
            )
        )
        if first and fields["opening_date"] > first:
            raise ValidationFailed(
                f"Opening date cannot be after the account's first transaction ({first.isoformat()})"
            )
    if fields.get("is_archived") is True and not acc.is_archived:
        bal = balance_of(db, acc.id)
        if bal != 0:
            raise Conflict(
                f"This account still holds {bal} {acc.currency}. Transfer the money out or record an "
                "adjustment so the balance is 0 before archiving; archived balances are excluded from totals."
            )
    for key, value in fields.items():
        if value is None and key in ("name", "type", "opening_balance", "opening_date", "is_archived"):
            continue
        setattr(acc, key, q(value) if key == "opening_balance" else value)
    db.commit()
    return acc


def delete_account(db: Session, account_id: int) -> None:
    acc = get_account(db, account_id)
    used = db.scalar(
        select(func.count()).where((Transaction.account_id == acc.id) | (Transaction.to_account_id == acc.id))
    )
    if used:
        raise Conflict(
            f"'{acc.name}' has {used} transaction(s). Accounts with history cannot be deleted; archive it instead."
        )
    if db.scalar(select(func.count()).where(RecurringRule.account_id == acc.id)):
        raise Conflict(f"'{acc.name}' is used by recurring payments. Reassign or delete them first.")
    db.query(InstallmentPlan).filter(InstallmentPlan.default_account_id == acc.id).update(
        {"default_account_id": None}
    )
    db.delete(acc)
    db.commit()


def require_usable_account(db: Session, account_id: int, role: str = "Account") -> Account:
    acc = db.get(Account, account_id)
    if acc is None:
        raise ValidationFailed(f"{role} {account_id} does not exist")
    if acc.is_archived:
        raise ValidationFailed(f"{role} '{acc.name}' is archived; unarchive it to record new transactions")
    return acc
