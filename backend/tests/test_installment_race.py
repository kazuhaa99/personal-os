"""Two payments recorded at the same moment must not together pay more than is owed."""

from datetime import date
from decimal import Decimal

import pytest

from app.db import SessionLocal
from app.errors import ValidationFailed
from app.models import InstallmentPlan
from app.schemas.finance import InstallmentPaymentCreate
from app.services import installments
from tests.test_budgets_recurring_installments import _plan


def test_a_payment_racing_another_cannot_overpay(api):
    acc = api.account(opening="500000")
    plan = _plan(api, acc, original_amount="30000")
    pay_all = InstallmentPaymentCreate(date=date(2026, 3, 15), amount=Decimal("30000"))

    with SessionLocal() as first, SessionLocal() as second:
        stale = second.get(InstallmentPlan, plan["id"])
        assert installments.outstanding(stale) == Decimal("30000.00")  # read before the other payment

        installments.record_payment(first, plan["id"], pay_all)
        with pytest.raises(ValidationFailed):
            installments.record_payment(second, plan["id"], pay_all)

    saved = next(p for p in api.ok(api.c.get("/api/installments")) if p["id"] == plan["id"])
    assert saved["outstanding"] == "0.00"
