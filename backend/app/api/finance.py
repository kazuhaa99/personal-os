from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.finance import (
    AccountCreate,
    AccountOut,
    AccountUpdate,
    BudgetMonth,
    BudgetSet,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ConfirmOccurrence,
    ExpectedPayment,
    ImportReport,
    InstallmentCreate,
    InstallmentOut,
    InstallmentPaymentCreate,
    InstallmentUpdate,
    RecurringCreate,
    RecurringOut,
    RecurringUpdate,
    SkipOccurrence,
    TransactionCreate,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
)
from app.services import accounts, budgets, categories, csv_io, installments, recurring, transactions
from app.services.dates import MONTH_PATTERN, parse_month, today_for

router = APIRouter()


# ------------------------------------------------------------------ accounts


@router.get("/accounts", response_model=list[AccountOut], tags=["accounts"])
def list_accounts(include_archived: bool = True, db: Session = Depends(get_db)):
    return accounts.list_accounts(db, include_archived)


@router.post("/accounts", response_model=AccountOut, status_code=201, tags=["accounts"])
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    return accounts.account_out(db, accounts.create_account(db, data))


@router.get("/accounts/{account_id}", response_model=AccountOut, tags=["accounts"])
def get_account(account_id: int, db: Session = Depends(get_db)):
    return accounts.account_out(db, accounts.get_account(db, account_id))


@router.patch("/accounts/{account_id}", response_model=AccountOut, tags=["accounts"])
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    return accounts.account_out(db, accounts.update_account(db, account_id, data))


@router.delete("/accounts/{account_id}", status_code=204, tags=["accounts"])
def delete_account(account_id: int, db: Session = Depends(get_db)):
    accounts.delete_account(db, account_id)


# ------------------------------------------------------------------ categories


@router.get("/categories", response_model=list[CategoryOut], tags=["categories"])
def list_categories(kind: Literal["income", "expense"] | None = None, include_archived: bool = True,
                    db: Session = Depends(get_db)):
    return categories.list_categories(db, kind, include_archived)


@router.post("/categories", response_model=CategoryOut, status_code=201, tags=["categories"])
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    return categories.create_category(db, data)


@router.patch("/categories/{category_id}", response_model=CategoryOut, tags=["categories"])
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    return categories.update_category(db, category_id, data)


@router.delete("/categories/{category_id}", status_code=204, tags=["categories"])
def delete_category(category_id: int, db: Session = Depends(get_db)):
    categories.delete_category(db, category_id)


# ------------------------------------------------------------------ transactions


def tx_filter(
    start: date | None = None,
    end: date | None = None,
    account_id: int | None = None,
    type: Literal["income", "expense", "transfer"] | None = None,
    category_id: int | None = None,
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = Query(default=None, max_length=40),
    min_amount: Decimal | None = Query(default=None, ge=0),
    max_amount: Decimal | None = Query(default=None, ge=0),
) -> transactions.TxFilter:
    return transactions.TxFilter(start=start, end=end, account_id=account_id, type=type, category_id=category_id,
                                 search=q, tag=tag, min_amount=min_amount, max_amount=max_amount)


@router.get("/transactions", response_model=TransactionPage, tags=["transactions"])
def list_transactions(f: transactions.TxFilter = Depends(tx_filter), limit: int = Query(50, ge=1, le=500),
                      offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return transactions.list_transactions(db, f, limit, offset)


@router.post("/transactions", response_model=TransactionOut, status_code=201, tags=["transactions"])
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    return transactions.transaction_out(db, transactions.create_transaction(db, data))


@router.get("/transactions/export.csv", tags=["transactions"])
def export_transactions(f: transactions.TxFilter = Depends(tx_filter), db: Session = Depends(get_db)):
    body = csv_io.export_csv(db, f)
    name = f"transactions-{today_for(db).isoformat()}.csv"
    return Response(content=body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/transactions/import", response_model=ImportReport, tags=["transactions"])
async def import_transactions(file: UploadFile = File(...), dry_run: bool = True, db: Session = Depends(get_db)):
    content = await file.read(csv_io.MAX_BYTES + 1)
    # Parsing and saving thousands of rows is blocking work: keep it off the event loop.
    return await run_in_threadpool(lambda: csv_io.import_csv(db, csv_io.decode(content), dry_run=dry_run))


@router.get("/transactions/{tx_id}", response_model=TransactionOut, tags=["transactions"])
def get_transaction(tx_id: int, db: Session = Depends(get_db)):
    return transactions.transaction_out(db, transactions.get_transaction(db, tx_id))


@router.patch("/transactions/{tx_id}", response_model=TransactionOut, tags=["transactions"])
def update_transaction(tx_id: int, data: TransactionUpdate, db: Session = Depends(get_db)):
    return transactions.transaction_out(db, transactions.update_transaction(db, tx_id, data))


@router.delete("/transactions/{tx_id}", status_code=204, tags=["transactions"])
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    transactions.delete_transaction(db, tx_id)


# ------------------------------------------------------------------ budgets


@router.get("/budgets", response_model=BudgetMonth, tags=["budgets"])
def get_budgets(month: str | None = Query(default=None, pattern=MONTH_PATTERN), db: Session = Depends(get_db)):
    return budgets.budget_month(db, parse_month(month) if month else today_for(db))


@router.put("/budgets", response_model=BudgetMonth, tags=["budgets"])
def set_budget(data: BudgetSet, db: Session = Depends(get_db)):
    budgets.set_budget(db, data)
    return budgets.budget_month(db, parse_month(data.month))


# ------------------------------------------------------------------ recurring


@router.get("/recurring", response_model=list[RecurringOut], tags=["recurring"])
def list_recurring(db: Session = Depends(get_db)):
    counts = recurring.confirmed_counts(db)
    return [recurring.serialize(db, r, confirmed=counts.get(r.id, 0)) for r in recurring.list_rules(db)]


@router.post("/recurring", response_model=RecurringOut, status_code=201, tags=["recurring"])
def create_recurring(data: RecurringCreate, db: Session = Depends(get_db)):
    return recurring.serialize(db, recurring.create_rule(db, data))


@router.get("/recurring/expected", response_model=list[ExpectedPayment], tags=["recurring"])
def expected(days: int = Query(30, ge=1, le=366), db: Session = Depends(get_db)):
    items = recurring.expected_payments(db, days) + installments.upcoming_installments(db, days)
    return sorted(items, key=lambda p: p["due_date"])


@router.patch("/recurring/{rule_id}", response_model=RecurringOut, tags=["recurring"])
def update_recurring(rule_id: int, data: RecurringUpdate, db: Session = Depends(get_db)):
    return recurring.serialize(db, recurring.update_rule(db, rule_id, data))


@router.delete("/recurring/{rule_id}", status_code=204, tags=["recurring"])
def delete_recurring(rule_id: int, db: Session = Depends(get_db)):
    recurring.delete_rule(db, rule_id)


@router.post("/recurring/{rule_id}/confirm", response_model=TransactionOut, status_code=201, tags=["recurring"])
def confirm(rule_id: int, data: ConfirmOccurrence, db: Session = Depends(get_db)):
    return transactions.transaction_out(db, recurring.confirm_occurrence(db, rule_id, data))


@router.post("/recurring/{rule_id}/skip", response_model=RecurringOut, tags=["recurring"])
def skip(rule_id: int, data: SkipOccurrence, db: Session = Depends(get_db)):
    return recurring.serialize(db, recurring.skip_occurrence(db, rule_id, data.occurrence_date))


# ------------------------------------------------------------------ installments


@router.get("/installments", response_model=list[InstallmentOut], tags=["installments"])
def list_installments(db: Session = Depends(get_db)):
    return [installments.serialize(p) for p in installments.list_plans(db)]


@router.post("/installments", response_model=InstallmentOut, status_code=201, tags=["installments"])
def create_installment(data: InstallmentCreate, db: Session = Depends(get_db)):
    return installments.serialize(installments.create_plan(db, data))


@router.patch("/installments/{plan_id}", response_model=InstallmentOut, tags=["installments"])
def update_installment(plan_id: int, data: InstallmentUpdate, db: Session = Depends(get_db)):
    return installments.serialize(installments.update_plan(db, plan_id, data))


@router.delete("/installments/{plan_id}", status_code=204, tags=["installments"])
def delete_installment(plan_id: int, db: Session = Depends(get_db)):
    installments.delete_plan(db, plan_id)


@router.post("/installments/{plan_id}/payments", response_model=InstallmentOut, status_code=201,
             tags=["installments"])
def record_payment(plan_id: int, data: InstallmentPaymentCreate, db: Session = Depends(get_db)):
    installments.record_payment(db, plan_id, data)
    return installments.serialize(installments.get_plan(db, plan_id))


@router.delete("/installments/{plan_id}/payments/{payment_id}", response_model=InstallmentOut,
               tags=["installments"])
def delete_payment(plan_id: int, payment_id: int, db: Session = Depends(get_db)):
    installments.delete_payment(db, plan_id, payment_id)
    return installments.serialize(installments.get_plan(db, plan_id))
