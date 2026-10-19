from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import ValidationFailed
from app.models import AppSettings


def _defaults() -> AppSettings:
    return AppSettings(id=1, timezone=get_settings().default_timezone, primary_currency="KZT", owner_name="",
                       week_starts_on=0)


def ensure_app_settings(db: Session) -> None:
    """Create the singleton row (called once at startup)."""
    if db.get(AppSettings, 1) is None:
        db.add(_defaults())
        db.commit()


def get_app_settings(db: Session) -> AppSettings:
    """Read-only: never writes, so it is safe inside any transaction."""
    return db.get(AppSettings, 1) or _defaults()


def update_app_settings(db: Session, data: dict) -> AppSettings:
    row = db.get(AppSettings, 1)
    if row is None:
        row = _defaults()
        db.add(row)
    if "timezone" in data and data["timezone"] is not None:
        try:
            ZoneInfo(data["timezone"])
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValidationFailed(f"Unknown timezone '{data['timezone']}'") from exc
    for key, value in data.items():
        if value is not None:
            setattr(row, key, value)
    db.commit()
    return row
