from datetime import date, datetime
from datetime import date as Date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.services.dates import MONTH_PATTERN
from app.schemas.common import (
    ORM,
    Currency,
    Frequency,
    HexColor,
    Input,
    MoneyByCurrency,
    Name,
    NonNegativeMoney,
    OptText,
    PositiveMoney,
    SignedMoney,
)

AccountType = Literal["cash", "bank", "savings", "other"]
TxType = Literal["income", "expense", "transfer"]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


# ------------------------------------------------------------------ accounts


class AccountCreate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    type: AccountType
    currency: Currency = "KZT"
    opening_balance: SignedMoney = Decimal("0")
    opening_date: date | None = None
    notes: OptText = None


class AccountUpdate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    type: AccountType | None = None
    opening_balance: SignedMoney | None = None
    opening_date: date | None = None
    notes: OptText = None
    is_archived: bool | None = None


class AccountOut(ORM):
    id: int
    name: str
    type: str
    currency: str
    opening_balance: Decimal
    opening_date: date
    current_balance: Decimal
    is_archived: bool
    notes: str | None
    is_demo: bool
    transaction_count: int
    created_at: datetime


# ------------------------------------------------------------------ categories


class CategoryCreate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    kind: Literal["income", "expense"]
    color: HexColor = "#8b8b94"


class CategoryUpdate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] | None = None
    color: HexColor | None = None
    is_archived: bool | None = None


class CategoryOut(ORM):
    id: int
    name: str
    kind: str
    color: str
    is_archived: bool
    is_system: bool


# ------------------------------------------------------------------ transactions


class TransactionBase(Input):
    amount: PositiveMoney
    date: date
    account_id: int
    to_account_id: int | None = None
    category_id: int | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] = ""
    payee: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    tags: list[Tag] = Field(default_factory=list, max_length=20)

    @field_validator("tags")
    @classmethod
    def dedupe_tags(cls, v: list[str]) -> list[str]:
        seen: dict[str, None] = {}
        for t in v:
            seen.setdefault(t.lower(), None)
        return list(seen)


class TransactionCreate(TransactionBase):
    type: TxType

    @model_validator(mode="after")
    def check_shape(self):
        if self.type == "transfer":
            if self.to_account_id is None:
                raise ValueError("a transfer needs a destination account (to_account_id)")
            if self.to_account_id == self.account_id:
                raise ValueError("a transfer needs two different accounts")
            if self.category_id is not None:
                raise ValueError("transfers do not have a category")
        elif self.to_account_id is not None:
            raise ValueError("only transfers have a destination account")
        return self


class TransactionUpdate(Input):
    type: TxType | None = None
    amount: PositiveMoney | None = None
    date: Date | None = None
    account_id: int | None = None
    to_account_id: int | None = None
    category_id: int | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None
    payee: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    tags: list[Tag] | None = None


class AccountRef(ORM):
    id: int
    name: str
    currency: str


class CategoryRef(ORM):
    id: int
    name: str
    color: str


class TransactionOut(ORM):
    id: int
    type: str
    amount: Decimal
    currency: str
    date: date
    account: AccountRef
    to_account: AccountRef | None
    category: CategoryRef | None
    description: str
    payee: str | None
    tags: list[str]
    recurring_rule_id: int | None
    installment_payment_id: int | None = None
    is_demo: bool
    created_at: datetime


class TransactionTotals(BaseModel):
    """Totals for the current filter, grouped by currency. Transfers are reported
    separately and never mixed into income or expenses."""

    currency: str
    income: Decimal
    expense: Decimal
    net: Decimal
    transfers: Decimal


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int
    totals: list[TransactionTotals]


# ------------------------------------------------------------------ budgets


class BudgetSet(Input):
    category_id: int
    month: Annotated[str, StringConstraints(pattern=MONTH_PATTERN)]
    amount: NonNegativeMoney
    is_active: bool = True


class BudgetLine(BaseModel):
    category_id: int
    category_name: str
    color: str
    limit: Decimal
    spent: Decimal
    remaining: Decimal
    utilization: Decimal | None  # percent
    status: Literal["ok", "warning", "over"]
    effective_since: str
    previous_month_spent: Decimal
    average_3m_spent: Decimal | None  # None if not enough history


class BudgetMonth(BaseModel):
    month: str
    currency: str
    lines: list[BudgetLine]
    total_limit: Decimal
    total_spent_budgeted: Decimal
    unbudgeted_spent: Decimal
    note: str


# ------------------------------------------------------------------ recurring


class RecurringCreate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    type: Literal["income", "expense"]
    amount: PositiveMoney
    frequency: Frequency
    start_date: date
    end_date: date | None = None
    account_id: int
    category_id: int
    payee: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class RecurringUpdate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    amount: PositiveMoney | None = None
    end_date: date | None = None
    account_id: int | None = None
    category_id: int | None = None
    payee: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    is_active: bool | None = None
    next_due_date: date | None = None


class RecurringOut(ORM):
    id: int
    name: str
    type: str
    amount: Decimal
    currency: str
    frequency: str
    start_date: date
    next_due_date: date | None
    end_date: date | None
    account: AccountRef
    category: CategoryRef
    payee: str | None
    is_active: bool
    is_demo: bool
    monthly_equivalent: Decimal
    confirmed_count: int


class ConfirmOccurrence(Input):
    occurrence_date: date
    actual_date: date | None = None
    amount: PositiveMoney | None = None
    account_id: int | None = None


class SkipOccurrence(Input):
    occurrence_date: date


class ExpectedPayment(BaseModel):
    """A projected, not-yet-recorded payment. Never part of actual totals."""

    kind: Literal["recurring", "installment"]
    source_id: int
    name: str
    type: Literal["income", "expense"]
    amount: Decimal
    currency: str
    due_date: date
    overdue: bool
    account_name: str | None


# ------------------------------------------------------------------ installments


class InstallmentCreate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    lender: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    currency: Currency = "KZT"
    original_amount: PositiveMoney
    outstanding_amount: NonNegativeMoney | None = None  # defaults to original_amount
    payment_amount: PositiveMoney
    frequency: Frequency = "monthly"
    next_payment_date: date | None = None
    final_payment_date: date | None = None
    default_account_id: int | None = None
    notes: OptText = None

    @model_validator(mode="after")
    def check(self):
        if self.outstanding_amount is not None and self.outstanding_amount > self.original_amount:
            raise ValueError("outstanding amount cannot exceed the original amount")
        return self


class InstallmentUpdate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    lender: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    payment_amount: PositiveMoney | None = None
    frequency: Frequency | None = None
    next_payment_date: date | None = None
    final_payment_date: date | None = None
    default_account_id: int | None = None
    status: Literal["active", "paused", "cancelled"] | None = None
    notes: OptText = None


class InstallmentPaymentCreate(Input):
    date: date
    amount: PositiveMoney
    record_transaction: bool = True
    account_id: int | None = None
    note: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)] = None


class InstallmentPaymentOut(ORM):
    id: int
    date: date
    amount: Decimal
    transaction_id: int | None
    note: str | None


class InstallmentOut(BaseModel):
    id: int
    name: str
    lender: str | None
    currency: str
    original_amount: Decimal
    starting_outstanding: Decimal
    paid_amount: Decimal
    outstanding: Decimal
    progress: Decimal | None
    payment_amount: Decimal
    frequency: str
    next_payment_date: date | None
    final_payment_date: date | None
    status: str
    default_account_id: int | None
    notes: str | None
    is_demo: bool
    payments: list[InstallmentPaymentOut]
    remaining_payments_estimate: int | None
    estimated_payoff_date: date | None
    estimate_note: str


# ------------------------------------------------------------------ csv


class ImportRowIssue(BaseModel):
    row: int
    reason: str
    raw: dict[str, str]


class ImportReport(BaseModel):
    dry_run: bool
    total_rows: int
    imported: int
    rejected: list[ImportRowIssue]
    duplicates: list[ImportRowIssue]


# ------------------------------------------------------------------ overview


class BalanceSummary(BaseModel):
    by_currency: list[MoneyByCurrency]
    accounts: list[AccountOut]
