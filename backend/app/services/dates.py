"""Calendar arithmetic shared by recurring rules, installments, tasks and habits."""

import calendar
from collections.abc import Iterator
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session


def today_for(db: Session) -> date:
    """Today's date in the owner's configured timezone."""
    from app.services.settings import get_app_settings

    tz = ZoneInfo(get_app_settings(db).timezone)
    return datetime.now(tz).date()


def month_start(d: date) -> date:
    return d.replace(day=1)


def month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def add_months(d: date, months: int, anchor_day: int | None = None) -> date:
    """Shift by whole months, clamping to the month's last day.

    `anchor_day` keeps a schedule on its original day: Jan 31 -> Feb 28 -> Mar 31,
    rather than drifting to the 28th forever."""
    total = d.month - 1 + months
    year, month = d.year + total // 12, total % 12 + 1
    day = min(anchor_day or d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def parse_month(value: str) -> date:
    """'2026-03' -> date(2026, 3, 1)."""
    try:
        year, month = value.split("-")
        return date(int(year), int(month), 1)
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"'{value}' is not a month in YYYY-MM format") from exc


def months_between(start: date, end: date) -> list[date]:
    """First days of every month from start's month to end's month inclusive."""
    out, cur = [], month_start(start)
    while cur <= end:
        out.append(cur)
        cur = add_months(cur, 1)
    return out


def nth_occurrence(start: date, frequency: str, n: int) -> date:
    """The n-th (0-based) occurrence of a schedule that begins on `start`.

    Computed from the start date every time so month-end anchors never drift."""
    if frequency == "weekly":
        return start + timedelta(weeks=n)
    if frequency == "biweekly":
        return start + timedelta(weeks=2 * n)
    if frequency == "monthly":
        return add_months(start, n, start.day)
    if frequency == "quarterly":
        return add_months(start, 3 * n, start.day)
    if frequency == "yearly":
        return add_months(start, 12 * n, start.day)
    raise ValueError(f"unknown frequency '{frequency}'")


def occurrences(start: date, frequency: str, *, after: date | None = None,
                until: date, end: date | None = None) -> Iterator[date]:
    """Occurrences of the schedule that are > `after` (if given) and <= min(until, end)."""
    limit = min(until, end) if end else until
    n = 0
    if after is not None and frequency in ("weekly", "biweekly"):
        step = 7 if frequency == "weekly" else 14
        n = max(0, (after - start).days // step)
    elif after is not None:
        months = {"monthly": 1, "quarterly": 3, "yearly": 12}[frequency]
        n = max(0, ((after.year - start.year) * 12 + after.month - start.month) // months - 1)
    while True:
        d = nth_occurrence(start, frequency, n)
        if d > limit:
            return
        if after is None or d > after:
            yield d
        n += 1


def next_occurrence_after(start: date, frequency: str, after: date, end: date | None = None) -> date | None:
    """First occurrence strictly after `after`, or None if the schedule has ended."""
    horizon = after + timedelta(days=400)
    for d in occurrences(start, frequency, after=after, until=horizon, end=end):
        return d
    return None


def periods_per_year(frequency: str) -> int:
    return {"weekly": 52, "biweekly": 26, "monthly": 12, "quarterly": 4, "yearly": 1}[frequency]
