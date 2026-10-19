"""Installment plans and other manually tracked repayment obligations.

Accounting model (cash basis, MVP):
- Creating a plan records a liability only. No account balance changes.
- Recording a payment reduces the outstanding balance. With record_transaction=True it
  also creates ONE expense transaction (category "Debt and installment payments") that
  moves the cash. Analytics count that transaction once; the payment row is never
  summed into income/expense a second time.
- With record_transaction=False only the liability is reduced (e.g. the money was
  already recorded elsewhere, or a third party paid).
No interest/amortization is modelled yet.
"""

import math
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import Category, InstallmentPayment, InstallmentPlan, Transaction
from app.schemas.finance import InstallmentCreate, InstallmentPaymentCreate, InstallmentUpdate, TransactionCreate
from app.services.accounts import require_usable_account
from app.services.categories import INSTALLMENT_CATEGORY, ensure_default_categories
from app.services.dates import nth_occurrence, today_for
from app.services.money import ZERO, percent, q
from app.services.transactions import create_transaction


def paid_amount(plan: InstallmentPlan) -> Decimal:
    return q(sum((p.amount for p in plan.payments), ZERO))


def outstanding(plan: InstallmentPlan) -> Decimal:
    return q(plan.starting_outstanding - paid_amount(plan))


def _estimate(plan: InstallmentPlan, remaining: Decimal) -> tuple[int | None, date | None, str]:
    if plan.status in ("paid_off", "cancelled"):
        return 0, None, "No further payments expected."
    if remaining <= 0:
        return 0, None, "Fully repaid."
    count = math.ceil(remaining / plan.payment_amount)
    if plan.next_payment_date is None:
        return count, None, (
            f"About {count} more payment(s) of {plan.payment_amount} {plan.currency}; "
            "add a next payment date to estimate the payoff date."
        )
    payoff = nth_occurrence(plan.next_payment_date, plan.frequency, count - 1)
    note = (
        f"Estimate: {count} payment(s) of {plan.payment_amount} {plan.currency} on the "
        f"{plan.frequency} schedule, without interest."
    )
    if plan.final_payment_date and payoff > plan.final_payment_date:
        note += f" This runs past the stated final date ({plan.final_payment_date})."
    return count, payoff, note


def serialize(plan: InstallmentPlan) -> dict:
    paid, remaining = paid_amount(plan), outstanding(plan)
    count, payoff, note = _estimate(plan, remaining)
    return {
        "id": plan.id,
        "name": plan.name,
        "lender": plan.lender,
        "currency": plan.currency,
        "original_amount": plan.original_amount,
        "starting_outstanding": plan.starting_outstanding,
        "paid_amount": paid,
        "outstanding": remaining,
        "progress": percent(plan.original_amount - remaining, plan.original_amount),
        "payment_amount": plan.payment_amount,
        "frequency": plan.frequency,
        "next_payment_date": plan.next_payment_date,
        "final_payment_date": plan.final_payment_date,
        "status": plan.status,
        "default_account_id": plan.default_account_id,
        "notes": plan.notes,
        "is_demo": plan.is_demo,
        "payments": plan.payments,
        "remaining_payments_estimate": count,
        "estimated_payoff_date": payoff,
        "estimate_note": note,
    }


def get_plan(db: Session, plan_id: int) -> InstallmentPlan:
    plan = db.get(InstallmentPlan, plan_id)
    if plan is None:
        raise NotFound(f"Installment plan {plan_id} not found")
    return plan


def list_plans(db: Session) -> list[InstallmentPlan]:
    order = {"active": 0, "paused": 1, "paid_off": 2, "cancelled": 3}
    plans = list(db.scalars(select(InstallmentPlan)))
    return sorted(plans, key=lambda p: (order[p.status], p.next_payment_date or date.max, p.name))


def create_plan(db: Session, data: InstallmentCreate, *, is_demo: bool = False) -> InstallmentPlan:
    if data.default_account_id:
        acc = require_usable_account(db, data.default_account_id)
        if acc.currency != data.currency:
            raise ValidationFailed(f"Default account '{acc.name}' is in {acc.currency}, not {data.currency}")
    fields = data.model_dump(exclude={"outstanding_amount"})
    plan = InstallmentPlan(
        **fields,
        starting_outstanding=q(data.outstanding_amount if data.outstanding_amount is not None
                               else data.original_amount),
        is_demo=is_demo,
    )
    if plan.starting_outstanding == 0:
        plan.status = "paid_off"
        plan.next_payment_date = None
    db.add(plan)
    db.commit()
    return plan


def update_plan(db: Session, plan_id: int, data: InstallmentUpdate) -> InstallmentPlan:
    plan = get_plan(db, plan_id)
    fields = data.model_dump(exclude_unset=True)
    for key in ("name", "payment_amount", "frequency", "status"):
        if key in fields and fields[key] is None:
            fields.pop(key)
    if fields.get("default_account_id"):
        acc = require_usable_account(db, fields["default_account_id"])
        if acc.currency != plan.currency:
            raise ValidationFailed(f"Default account '{acc.name}' is in {acc.currency}, not {plan.currency}")
    if fields.get("status") == "active" and outstanding(plan) <= 0:
        raise ValidationFailed("This plan is fully repaid and cannot be reactivated")
    for key, value in fields.items():
        setattr(plan, key, value)
    db.commit()
    return plan


def delete_plan(db: Session, plan_id: int) -> None:
    plan = get_plan(db, plan_id)
    if plan.payments:
        raise Conflict(
            f"'{plan.name}' has {len(plan.payments)} recorded payment(s). Set its status to cancelled to keep "
            "the history, or delete the payments first."
        )
    db.delete(plan)
    db.commit()


def _installment_category(db: Session) -> Category:
    cat = db.scalar(select(Category).where(Category.kind == "expense", Category.name == INSTALLMENT_CATEGORY))
    if cat is None:
        ensure_default_categories(db)
        cat = db.scalar(select(Category).where(Category.kind == "expense", Category.name == INSTALLMENT_CATEGORY))
    return cat


def record_payment(db: Session, plan_id: int, data: InstallmentPaymentCreate) -> InstallmentPayment:
    plan = get_plan(db, plan_id)
    if plan.status in ("paid_off", "cancelled"):
        raise ValidationFailed(f"'{plan.name}' is {plan.status.replace('_', ' ')}; no further payments expected")
    remaining = outstanding(plan)
    if data.amount > remaining:
        raise ValidationFailed(
            f"Payment of {data.amount} exceeds the outstanding balance of {remaining} {plan.currency}"
        )
    tx = None
    if data.record_transaction:
        account_id = data.account_id or plan.default_account_id
        if account_id is None:
            raise ValidationFailed("Choose the account the payment was made from")
        acc = require_usable_account(db, account_id)
        if acc.currency != plan.currency:
            raise ValidationFailed(f"'{acc.name}' is in {acc.currency}, but this plan is in {plan.currency}")
        tx = create_transaction(
            db,
            TransactionCreate(
                type="expense",
                amount=data.amount,
                date=data.date,
                account_id=account_id,
                category_id=_installment_category(db).id,
                description=f"Installment: {plan.name}",
                payee=plan.lender,
            ),
            commit=False,
            is_demo=plan.is_demo,
        )
    payment = InstallmentPayment(plan_id=plan.id, date=data.date, amount=q(data.amount),
                                 transaction_id=tx.id if tx else None, note=data.note)
    db.add(payment)
    db.flush()
    db.refresh(plan)
    if outstanding(plan) == 0:
        plan.status = "paid_off"
        plan.next_payment_date = None
    elif plan.next_payment_date and data.date >= plan.next_payment_date - timedelta(days=15):
        # The scheduled instalment has been covered: move to the next one.
        plan.next_payment_date = nth_occurrence(plan.next_payment_date, plan.frequency, 1)
    db.commit()
    return payment


def delete_payment(db: Session, plan_id: int, payment_id: int) -> None:
    plan = get_plan(db, plan_id)
    payment = db.get(InstallmentPayment, payment_id)
    if payment is None or payment.plan_id != plan.id:
        raise NotFound(f"Payment {payment_id} not found on this plan")
    tx_id = payment.transaction_id
    db.delete(payment)
    db.flush()
    if tx_id:
        db.query(Transaction).filter(Transaction.id == tx_id).delete()
    db.refresh(plan)
    if plan.status == "paid_off" and outstanding(plan) > 0:
        plan.status = "active"
    db.commit()


def upcoming_installments(db: Session, days: int = 30, today: date | None = None) -> list[dict]:
    today = today or today_for(db)
    until = today + timedelta(days=days)
    out = []
    for plan in list_plans(db):
        if plan.status != "active" or plan.next_payment_date is None:
            continue
        remaining = outstanding(plan)
        due, n = plan.next_payment_date, 0
        while due <= until and remaining > 0:
            amount = min(plan.payment_amount, remaining)
            out.append(
                {
                    "kind": "installment",
                    "source_id": plan.id,
                    "name": plan.name,
                    "type": "expense",
                    "amount": q(amount),
                    "currency": plan.currency,
                    "due_date": due,
                    "overdue": due < today,
                    "account_name": None,
                }
            )
            remaining -= amount
            n += 1
            due = nth_occurrence(plan.next_payment_date, plan.frequency, n)
    return out
