"""Decimal helpers. Monetary values never pass through float."""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def q(value: Decimal | int | str | None) -> Decimal:
    """Quantize to cents (half-up). None counts as zero."""
    if value is None:
        return ZERO
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def percent(part: Decimal, whole: Decimal) -> Decimal | None:
    """part / whole as a percentage with one decimal place, or None if whole is zero."""
    if whole == 0:
        return None
    return (Decimal(part) * 100 / Decimal(whole)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


_SPACES = re.compile(r"[\s  ']")


def parse_amount(raw: str) -> Decimal:
    """Parse a user-supplied amount such as "1 234,50", "1234.50" or "-99".

    Rejects (raises ValueError) anything with more than two decimal places instead of
    silently rounding it, and anything that is not a finite number.
    """
    text = _SPACES.sub("", (raw or "").strip())
    if not text:
        raise ValueError("amount is empty")
    if "," in text and "." in text:
        # Whichever separator comes last is the decimal separator.
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        value = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"'{raw}' is not a valid number") from exc
    if not value.is_finite():
        raise ValueError(f"'{raw}' is not a valid number")
    if value.as_tuple().exponent < -2:  # type: ignore[operator]
        raise ValueError(f"'{raw}' has more than 2 decimal places")
    if abs(value) >= Decimal("1e12"):
        raise ValueError(f"'{raw}' is too large")
    return q(value)
