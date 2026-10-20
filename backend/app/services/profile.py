from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, undefer

from app.errors import NotFound, ValidationFailed
from app.models import Account, AppSettings, IncomeSource, Profile, Transaction, User
from app.services.auth import user_out
from app.services.dates import add_months, month_start, today_for
from app.services.money import ZERO, q
from app.tenancy import current_user_id

AVATAR_MAX_BYTES = 2 * 1024 * 1024
AVATAR_TYPES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}

# Average months per period, to compare incomes paid on different schedules.
PER_MONTH = {"weekly": Decimal(52) / 12, "biweekly": Decimal(26) / 12, "monthly": Decimal(1),
             "quarterly": Decimal(1) / 3, "yearly": Decimal(1) / 12}


def monthly(amount: Decimal, frequency: str) -> Decimal:
    return q(amount * PER_MONTH[frequency])


def _blank() -> Profile:
    return Profile(first_name="", last_name="", phone="", city="", occupation="", employer="", bio="",
                   salary_currency="KZT", salary_frequency="monthly", avatar_version=0)


def ensure_profile(db: Session) -> None:
    if db.get(Profile, current_user_id()) is None:
        db.add(_blank())
        db.commit()


def get_profile(db: Session) -> Profile:
    """Read-only: returns an unsaved blank profile if none exists yet."""
    return db.get(Profile, current_user_id()) or _blank()


def _row(db: Session) -> Profile:
    row = db.get(Profile, current_user_id())
    if row is None:
        row = _blank()
        db.add(row)
    return row


def update_profile(db: Session, data: dict) -> Profile:
    row = _row(db)
    nullable = {"birthday", "salary_amount", "payday"}
    for key, value in data.items():
        if value is None and key not in nullable:
            value = ""
        setattr(row, key, value)
    # The greeting on the overview uses the first name.
    if "first_name" in data:
        settings = db.get(AppSettings, current_user_id())
        if settings is not None:
            settings.owner_name = data["first_name"] or ""
    db.commit()
    return row


# ------------------------------------------------------------------ avatar

def set_avatar(db: Session, content: bytes) -> Profile:
    if len(content) > AVATAR_MAX_BYTES:
        raise ValidationFailed("The image is larger than 2 MB")
    mime = next((m for magic, m in AVATAR_TYPES.items() if content.startswith(magic)), None)
    if mime is None and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        mime = "image/webp"
    if mime is None:
        raise ValidationFailed("Upload a PNG, JPEG or WebP image")
    row = _row(db)
    row.avatar, row.avatar_type = content, mime
    row.avatar_version = (row.avatar_version or 0) + 1
    db.commit()
    return row


def get_avatar(db: Session) -> tuple[bytes, str]:
    row = db.scalars(select(Profile).options(undefer(Profile.avatar))).first()
    if row is None or not row.avatar:
        raise NotFound("No avatar")
    return row.avatar, row.avatar_type or "application/octet-stream"


def clear_avatar(db: Session) -> None:
    row = db.get(Profile, current_user_id())
    if row is not None:
        row.avatar = row.avatar_type = None
        row.avatar_version = (row.avatar_version or 0) + 1
        db.commit()


# ------------------------------------------------------------------ income sources

def list_sources(db: Session) -> list[IncomeSource]:
    return list(db.scalars(select(IncomeSource).order_by(IncomeSource.is_active.desc(), IncomeSource.id)))


def create_source(db: Session, data: dict) -> IncomeSource:
    src = IncomeSource(**data)
    db.add(src)
    db.commit()
    return src


def update_source(db: Session, source_id: int, data: dict) -> IncomeSource:
    src = db.get(IncomeSource, source_id)
    if src is None:
        raise NotFound("Income source not found")
    for k, v in data.items():
        if v is not None or k == "note":
            setattr(src, k, v)
    db.commit()
    return src


def delete_source(db: Session, source_id: int) -> None:
    src = db.get(IncomeSource, source_id)
    if src is None:
        raise NotFound("Income source not found")
    db.delete(src)
    db.commit()


# ------------------------------------------------------------------ output

def source_out(src: IncomeSource) -> dict:
    return {"id": src.id, "name": src.name, "amount": src.amount, "currency": src.currency, "frequency": src.frequency,
            "note": src.note, "is_active": src.is_active, "monthly_amount": monthly(src.amount, src.frequency)}


def _received(db: Session) -> dict[str, Decimal]:
    today = today_for(db)
    start = month_start(today)
    rows = db.execute(
        select(Account.currency, func.sum(Transaction.amount))
        .join(Account, Transaction.account_id == Account.id)
        .where(Transaction.type == "income", Transaction.date >= start, Transaction.date < add_months(start, 1))
        .group_by(Account.currency)
    )
    return {cur: q(total or ZERO) for cur, total in rows}


def profile_out(db: Session) -> dict:
    p = get_profile(db)
    sources = list_sources(db)
    salary: dict[str, Decimal] = {}
    extra: dict[str, Decimal] = {}
    if p.salary_amount:
        salary[p.salary_currency] = monthly(p.salary_amount, p.salary_frequency)
    for s in sources:
        if s.is_active:
            extra[s.currency] = extra.get(s.currency, ZERO) + monthly(s.amount, s.frequency)
    received = _received(db)
    currencies = sorted(set(salary) | set(extra), key=lambda c: (c != p.salary_currency, c))
    return {
        **{k: getattr(p, k) for k in ("first_name", "last_name", "phone", "birthday", "city", "occupation",
                                      "employer", "bio", "salary_amount", "salary_currency", "salary_frequency", "payday")},
        "account": user_out(db.get(User, current_user_id())),
        "avatar_url": f"/api/profile/avatar?v={p.avatar_version}" if p.avatar_type else None,
        "updated_at": p.updated_at,
        "income_sources": [source_out(s) for s in sources],
        "monthly": [{"currency": c, "salary": salary.get(c, ZERO), "extra": extra.get(c, ZERO),
                     "expected": salary.get(c, ZERO) + extra.get(c, ZERO), "received_this_month": received.get(c, ZERO)}
                    for c in currencies],
    }
