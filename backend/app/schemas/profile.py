from datetime import date as Date
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator

from app.schemas.common import ORM, Currency, Frequency, Input, Name, NonNegativeMoney, OptText, PositiveMoney

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]
Medium = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class ProfileUpdate(Input):
    first_name: Short | None = None
    last_name: Short | None = None
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40, pattern=r"^[0-9+()\-\s.]*$")] | None = None
    birthday: Date | None = None
    city: Short | None = None
    occupation: Medium | None = None
    employer: Medium | None = None
    bio: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    salary_amount: NonNegativeMoney | None = None
    salary_currency: Currency | None = None
    salary_frequency: Frequency | None = None
    payday: Annotated[int, Field(ge=1, le=31)] | None = None

    @field_validator("birthday")
    @classmethod
    def _birthday(cls, v: Date | None) -> Date | None:
        if v and not (Date(1900, 1, 1) <= v <= Date.today()):
            raise ValueError("Birthday must be between 1900 and today")
        return v


class IncomeSourceIn(Input):
    name: Name
    amount: PositiveMoney
    currency: Currency = "KZT"
    frequency: Frequency = "monthly"
    note: OptText = None
    is_active: bool = True


class IncomeSourceUpdate(Input):
    name: Name | None = None
    amount: PositiveMoney | None = None
    currency: Currency | None = None
    frequency: Frequency | None = None
    note: OptText = None
    is_active: bool | None = None


class IncomeSourceOut(ORM):
    id: int
    name: str
    amount: Decimal
    currency: str
    frequency: str
    note: str | None
    is_active: bool
    monthly_amount: Decimal


class MonthlyIncome(ORM):
    currency: str
    expected: Decimal  # salary + active sources, normalised to a month
    salary: Decimal
    extra: Decimal
    received_this_month: Decimal  # actual income transactions in accounts of this currency


class AccountOut(ORM):
    id: int
    username: str
    email: str
    email_verified: bool
    pending_email: str | None
    change_email_pending: bool


class ProfileOut(ORM):
    account: AccountOut
    first_name: str
    last_name: str
    phone: str
    birthday: Date | None
    city: str
    occupation: str
    employer: str
    bio: str
    salary_amount: Decimal | None
    salary_currency: str
    salary_frequency: str
    payday: int | None
    avatar_url: str | None
    updated_at: datetime | None
    income_sources: list[IncomeSourceOut]
    monthly: list[MonthlyIncome]
