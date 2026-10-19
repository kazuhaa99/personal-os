from datetime import date
from decimal import Decimal

import pytest

from app.services.dates import add_months, next_occurrence_after, nth_occurrence, occurrences
from app.services.money import parse_amount, percent, q


@pytest.mark.parametrize("raw,expected", [
    ("1234.5", "1234.50"), ("1 234,56", "1234.56"), ("1,234.56", "1234.56"), ("1.234,56", "1234.56"),
    ("-99", "-99.00"), ("0.1", "0.10"), ("1 000", "1000.00"),
])
def test_parse_amount_accepts_common_formats(raw, expected):
    assert parse_amount(raw) == Decimal(expected)


@pytest.mark.parametrize("raw", ["", "abc", "1.234", "12.345", "NaN", "Infinity", "1e13"])
def test_parse_amount_rejects_invalid_or_overprecise(raw):
    with pytest.raises(ValueError):
        parse_amount(raw)


def test_decimal_sums_are_exact():
    assert q(Decimal("0.1") + Decimal("0.2")) == Decimal("0.30")
    assert sum([Decimal("0.10")] * 10, Decimal(0)) == Decimal("1.00")


def test_rounding_is_half_up_and_percent_handles_zero():
    assert q(Decimal("2.345")) == Decimal("2.35")
    assert q(Decimal("2.344")) == Decimal("2.34")
    assert percent(Decimal("1"), Decimal("3")) == Decimal("33.3")
    assert percent(Decimal("5"), Decimal("0")) is None


def test_add_months_clamps_to_month_end():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)


def test_monthly_schedule_keeps_its_anchor_day():
    start = date(2026, 1, 31)
    assert [nth_occurrence(start, "monthly", n) for n in range(4)] == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)]


def test_occurrences_window_and_end_date():
    start = date(2026, 1, 1)
    got = list(occurrences(start, "weekly", after=date(2026, 1, 8), until=date(2026, 2, 1)))
    assert got == [date(2026, 1, 15), date(2026, 1, 22), date(2026, 1, 29)]
    assert list(occurrences(start, "monthly", until=date(2026, 12, 31), end=date(2026, 3, 1))) == [
        date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)]
    assert next_occurrence_after(start, "yearly", date(2026, 1, 1)) == date(2027, 1, 1)
    assert next_occurrence_after(start, "monthly", date(2026, 3, 1), end=date(2026, 3, 1)) is None
