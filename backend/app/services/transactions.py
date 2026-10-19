"""Transactions: the only thing that moves money.

Rules enforced here (in addition to DB constraints):
- income/expense need a category of the matching kind; transfers have none;
- accounts must exist and not be archived;
- transfers only between accounts of the same currency (MVP);
- a transaction cannot be dated before its account's opening date;
- transactions created by an installment payment can only be changed through it.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import Select, String, cast, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import Account, Category, InstallmentPayment, RecurringRule, Transaction
from app.schemas.finance import TransactionCreate, TransactionUpdate
from app.services.accounts import require_usable_account
from app.services.money import ZERO, q


@dataclass
class TxFilter:
    start: date | None = None
    end: date | None = None
    account_id: int | None = None
    type: str | None = None
    category_id: int | None = None
    search: str | None = None
    tag: str | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    include_demo: bool = True


def _validate(db: Session, *, type: str, account_id: int, to_account_id: int | None,
              category_id: int | None, tx_date: date, existing: Transaction | None = None) -> None:
    def usable(acc_id: int, role: str) -> Account:
        # Keep editing possible on old transactions whose account was archived later,
        # as long as the account itself is not being changed.
        if existing is not None and acc_id in (existing.account_id, existing.to_account_id):
            acc = db.get(Account, acc_id)
            if acc is not None:
                return acc
        return require_usable_account(db, acc_id, role)

    src = usable(account_id, "Account")
    if tx_date < src.opening_date:
        raise ValidationFailed(
            f"Date {tx_date} is before '{src.name}' was opened ({src.opening_date}). "
            "Change the account's opening date if you are entering older history."
        )
    if type == "transfer":
        if to_account_id is None or to_account_id == account_id:
            raise ValidationFailed("A transfer needs two different accounts")
        if category_id is not None:
            raise ValidationFailed("Transfers do not have a category")
        dst = usable(to_account_id, "Destination account")
        if dst.currency != src.currency:
            raise ValidationFailed(
                f"Cross-currency transfers ({src.currency} -> {dst.currency}) are not supported yet"
            )
        if tx_date < dst.opening_date:
            raise ValidationFailed(f"Date {tx_date} is before '{dst.name}' was opened ({dst.opening_date})")
        return
    if to_account_id is not None:
        raise ValidationFailed("Only transfers have a destination account")
    if category_id is None:
        raise ValidationFailed(f"An {type} needs a category")
    cat = db.get(Category, category_id)
    if cat is None:
        raise ValidationFailed(f"Category {category_id} does not exist")
    if cat.kind != type:
        raise ValidationFailed(f"'{cat.name}' is an {cat.kind} category and cannot be used for an {type}")
    if cat.is_archived and (existing is None or existing.category_id != cat.id):
        raise ValidationFailed(f"Category '{cat.name}' is archived")


def get_transaction(db: Session, tx_id: int) -> Transaction:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        raise NotFound(f"Transaction {tx_id} not found")
    return tx


def create_transaction(db: Session, data: TransactionCreate, *, is_demo: bool = False,
                       recurring_rule_id: int | None = None, occurrence_date: date | None = None,
                       commit: bool = True) -> Transaction:
    _validate(db, type=data.type, account_id=data.account_id, to_account_id=data.to_account_id,
              category_id=data.category_id, tx_date=data.date)
    tx = Transaction(
        type=data.type,
        amount=q(data.amount),
        date=data.date,
        account_id=data.account_id,
        to_account_id=data.to_account_id,
        category_id=data.category_id,
        description=data.description,
        payee=data.payee or None,
        tags=data.tags,
        recurring_rule_id=recurring_rule_id,
        recurring_occurrence_date=occurrence_date,
        is_demo=is_demo,
    )
    db.add(tx)
    if commit:
        db.commit()
    else:
        db.flush()
    return tx


def _linked_payment(db: Session, tx_id: int) -> InstallmentPayment | None:
    return db.scalar(select(InstallmentPayment).where(InstallmentPayment.transaction_id == tx_id))


def update_transaction(db: Session, tx_id: int, data: TransactionUpdate) -> Transaction:
    tx = get_transaction(db, tx_id)
    fields = data.model_dump(exclude_unset=True)
    for required in ("type", "amount", "date", "account_id", "description", "tags"):
        if required in fields and fields[required] is None:
            fields.pop(required)

    payment = _linked_payment(db, tx.id)
    if payment and any(k in fields and fields[k] != getattr(tx, k) for k in ("type", "amount", "account_id")):
        raise Conflict(
            "This transaction records an installment payment. Change the amount or account by editing "
            "that payment in Installments, so the outstanding balance stays consistent."
        )

    new_type = fields.get("type", tx.type)
    if new_type == "transfer":
        fields.setdefault("category_id", None)
        if tx.type != "transfer":
            fields["category_id"] = None
    else:
        fields["to_account_id"] = None
        if tx.type == "transfer" and "category_id" not in fields:
            raise ValidationFailed(f"Choose a category when changing a transfer into an {new_type}")
    merged = {
        "type": new_type,
        "account_id": fields.get("account_id", tx.account_id),
        "to_account_id": fields.get("to_account_id", tx.to_account_id),
        "category_id": fields.get("category_id", tx.category_id),
        "tx_date": fields.get("date", tx.date),
    }
    _validate(db, existing=tx, **merged)
    for key, value in fields.items():
        setattr(tx, key, q(value) if key == "amount" else value)
    if payment and "date" in fields:
        payment.date = fields["date"]
    db.commit()
    db.refresh(tx)
    return tx


def delete_transaction(db: Session, tx_id: int) -> None:
    tx = get_transaction(db, tx_id)
    if _linked_payment(db, tx.id):
        raise Conflict(
            "This transaction records an installment payment. Delete the payment in Installments instead; "
            "that removes both records together."
        )
    if tx.recurring_rule_id and tx.recurring_occurrence_date:
        # Re-open the occurrence so it shows up as expected again.
        rule = db.get(RecurringRule, tx.recurring_rule_id)
        if rule and (rule.next_due_date is None or tx.recurring_occurrence_date < rule.next_due_date):
            rule.next_due_date = tx.recurring_occurrence_date
    db.delete(tx)
    db.commit()


def _apply_filter(stmt: Select, f: TxFilter) -> Select:
    if f.start:
        stmt = stmt.where(Transaction.date >= f.start)
    if f.end:
        stmt = stmt.where(Transaction.date <= f.end)
    if f.account_id:
        stmt = stmt.where(or_(Transaction.account_id == f.account_id, Transaction.to_account_id == f.account_id))
    if f.type:
        stmt = stmt.where(Transaction.type == f.type)
    if f.category_id:
        stmt = stmt.where(Transaction.category_id == f.category_id)
    if f.search:
        like = f"%{f.search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Transaction.description).like(like),
                func.lower(func.coalesce(Transaction.payee, "")).like(like),
                func.lower(cast(Transaction.amount, String)).like(like),
            )
        )
    if f.tag:
        stmt = stmt.where(Transaction.tags.any(f.tag.strip().lower()))
    if f.min_amount is not None:
        stmt = stmt.where(Transaction.amount >= f.min_amount)
    if f.max_amount is not None:
        stmt = stmt.where(Transaction.amount <= f.max_amount)
    if not f.include_demo:
        stmt = stmt.where(Transaction.is_demo.is_(False))
    return stmt


def serialize(tx: Transaction, payment_id: int | None = None) -> dict:
    return {
        "id": tx.id,
        "type": tx.type,
        "amount": tx.amount,
        "currency": tx.account.currency,
        "date": tx.date,
        "account": tx.account,
        "to_account": tx.to_account,
        "category": tx.category,
        "description": tx.description,
        "payee": tx.payee,
        "tags": tx.tags or [],
        "recurring_rule_id": tx.recurring_rule_id,
        "installment_payment_id": payment_id,
        "is_demo": tx.is_demo,
        "created_at": tx.created_at,
    }


def transaction_out(db: Session, tx: Transaction) -> dict:
    payment = _linked_payment(db, tx.id)
    return serialize(tx, payment.id if payment else None)


def totals(db: Session, f: TxFilter) -> list[dict]:
    src = aliased(Account)
    stmt = _apply_filter(
        select(src.currency, Transaction.type, func.sum(Transaction.amount))
        .join(src, src.id == Transaction.account_id)
        .group_by(src.currency, Transaction.type),
        f,
    )
    acc: dict[str, dict[str, Decimal]] = {}
    for currency, tx_type, total in db.execute(stmt):
        acc.setdefault(currency, {"income": ZERO, "expense": ZERO, "transfer": ZERO})[tx_type] = q(total)
    return [
        {
            "currency": cur,
            "income": v["income"],
            "expense": v["expense"],
            "net": q(v["income"] - v["expense"]),
            "transfers": v["transfer"],
        }
        for cur, v in sorted(acc.items())
    ]


def list_transactions(db: Session, f: TxFilter, limit: int = 50, offset: int = 0) -> dict:
    base = _apply_filter(select(Transaction), f)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = list(
        db.scalars(base.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit).offset(offset)).unique()
    )
    payment_ids = dict(
        db.execute(
            select(InstallmentPayment.transaction_id, InstallmentPayment.id).where(
                InstallmentPayment.transaction_id.in_([t.id for t in rows])
            )
        ).all()
    ) if rows else {}
    return {
        "items": [serialize(t, payment_ids.get(t.id)) for t in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "totals": totals(db, f),
    }


def iter_filtered(db: Session, f: TxFilter) -> list[Transaction]:
    stmt = _apply_filter(select(Transaction), f).order_by(Transaction.date, Transaction.id)
    return list(db.scalars(stmt).unique())
