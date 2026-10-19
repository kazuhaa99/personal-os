from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound
from app.models import BudgetLimit, Category, RecurringRule, Transaction
from app.schemas.finance import CategoryCreate, CategoryUpdate

DEFAULT_CATEGORIES: list[tuple[str, str, str]] = [
    ("income", "Salary", "#4ade80"),
    ("income", "Freelance income", "#34d399"),
    ("income", "Other income", "#a3e635"),
    ("expense", "Food and groceries", "#f59e0b"),
    ("expense", "Restaurants and coffee", "#fb923c"),
    ("expense", "Transport", "#38bdf8"),
    ("expense", "Housing and utilities", "#818cf8"),
    ("expense", "Shopping", "#f472b6"),
    ("expense", "Entertainment", "#c084fc"),
    ("expense", "Education", "#22d3ee"),
    ("expense", "Health and fitness", "#2dd4bf"),
    ("expense", "Subscriptions", "#a78bfa"),
    ("expense", "Debt and installment payments", "#f87171"),
    ("expense", "Savings", "#60a5fa"),
    ("expense", "Other", "#9ca3af"),
]

INSTALLMENT_CATEGORY = "Debt and installment payments"


def ensure_default_categories(db: Session) -> None:
    """Idempotently create the default categories (not demo data: they are a starting point)."""
    existing = {(c.kind, c.name.lower()) for c in db.scalars(select(Category))}
    for kind, name, color in DEFAULT_CATEGORIES:
        if (kind, name.lower()) not in existing:
            db.add(Category(kind=kind, name=name, color=color, is_system=name == INSTALLMENT_CATEGORY))
    db.commit()


def list_categories(db: Session, kind: str | None = None, include_archived: bool = True) -> list[Category]:
    stmt = select(Category).order_by(Category.kind, Category.name)
    if kind:
        stmt = stmt.where(Category.kind == kind)
    if not include_archived:
        stmt = stmt.where(Category.is_archived.is_(False))
    return list(db.scalars(stmt))


def get_category(db: Session, category_id: int) -> Category:
    cat = db.get(Category, category_id)
    if cat is None:
        raise NotFound(f"Category {category_id} not found")
    return cat


def _ensure_unique(db: Session, kind: str, name: str, exclude_id: int | None = None) -> None:
    stmt = select(Category.id).where(Category.kind == kind, func.lower(Category.name) == name.lower())
    if exclude_id:
        stmt = stmt.where(Category.id != exclude_id)
    if db.scalar(stmt):
        raise Conflict(f"An {kind} category named '{name}' already exists")


def create_category(db: Session, data: CategoryCreate) -> Category:
    _ensure_unique(db, data.kind, data.name)
    cat = Category(name=data.name, kind=data.kind, color=data.color)
    db.add(cat)
    db.commit()
    return cat


def update_category(db: Session, category_id: int, data: CategoryUpdate) -> Category:
    cat = get_category(db, category_id)
    fields = data.model_dump(exclude_unset=True, exclude_none=True)
    if "name" in fields:
        _ensure_unique(db, cat.kind, fields["name"], exclude_id=cat.id)
    for key, value in fields.items():
        setattr(cat, key, value)
    db.commit()
    return cat


def delete_category(db: Session, category_id: int) -> None:
    cat = get_category(db, category_id)
    if cat.is_system:
        raise Conflict(f"'{cat.name}' is used by the installments module and cannot be deleted")
    used = db.scalar(select(func.count()).where(Transaction.category_id == cat.id))
    used += db.scalar(select(func.count()).where(RecurringRule.category_id == cat.id))
    if used:
        raise Conflict(f"'{cat.name}' is used by {used} record(s). Archive it instead so history is preserved.")
    db.query(BudgetLimit).filter(BudgetLimit.category_id == cat.id).delete()
    db.delete(cat)
    db.commit()
