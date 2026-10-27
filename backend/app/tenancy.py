"""Per-user data isolation, enforced in one place.

Every model that inherits `Owned` carries a `user_id`. For the duration of a
request the authenticated user's id sits in a context variable, and two
session hooks use it:

- do_orm_execute adds `user_id = <current user>` to every ORM SELECT, UPDATE
  and DELETE touching an Owned entity (including Session.get and relationship
  loads). With no user set the criteria match nothing, so code that forgets
  to authenticate fails closed instead of leaking everything.
- before_flush stamps new Owned rows with the current user and rejects any
  foreign key that points at a row the current user cannot see (e.g. a
  transaction referencing another user's account id).
"""

from contextlib import contextmanager
from contextvars import ContextVar

from sqlalchemy import ForeignKey, Integer, event, select
from sqlalchemy.orm import Mapped, Session, declared_attr, mapped_column, with_loader_criteria

from app.errors import NotFound

_user_id: ContextVar[int | None] = ContextVar("user_id", default=None)
NOBODY = -1


def current_user_id() -> int | None:
    return _user_id.get()


def set_current_user(user_id: int | None) -> None:
    _user_id.set(user_id)


@contextmanager
def acting_as(user_id: int):
    token = _user_id.set(user_id)
    try:
        yield
    finally:
        _user_id.reset(token)


class Owned:
    """Mixin: the row belongs to one user."""

    @declared_attr
    def user_id(cls) -> Mapped[int]:
        return mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)


@event.listens_for(Session, "do_orm_execute")
def _scope_to_user(state) -> None:
    if not (state.is_select or state.is_update or state.is_delete):
        return
    uid = current_user_id()
    uid = NOBODY if uid is None else uid
    stmt = state.statement.options(with_loader_criteria(Owned, lambda cls: cls.user_id == uid, include_aliases=True))
    # Column-only selects such as select(func.count()).where(Task.status == ...) have no ORM entity
    # for the criteria to attach to, so also filter every owned table in the final FROM list.
    if state.is_select and hasattr(stmt, "get_final_froms"):
        for frm in _flatten(stmt.get_final_froms()):
            if "user_id" in frm.c and getattr(frm, "name", None) in _owned_table_names():
                stmt = stmt.where(frm.c.user_id == uid)
    state.statement = stmt


def _flatten(froms):
    from sqlalchemy.sql.selectable import Join

    for f in froms:
        if isinstance(f, Join):
            yield from _flatten([f.left, f.right])
        else:
            yield f


_OWNED_TABLES: set[str] | None = None


def _owned_table_names() -> set[str]:
    global _OWNED_TABLES
    if _OWNED_TABLES is None:
        from app.db import Base

        _OWNED_TABLES = {m.local_table.name for m in Base.registry.mappers if issubclass(m.class_, Owned)}
    return _OWNED_TABLES


def _owned_classes_by_table(session: Session) -> dict[str, type]:
    from app.db import Base

    return {m.local_table.name: m.class_ for m in Base.registry.mappers if issubclass(m.class_, Owned)}


@event.listens_for(Session, "before_flush")
def _stamp_and_check(session: Session, _ctx, _instances) -> None:
    uid = current_user_id()
    owned = None
    links: dict[tuple[type, str], list] = {}
    for obj in list(session.new) + list(session.dirty):
        if not isinstance(obj, Owned):
            continue
        if obj in session.new:
            if obj.user_id is None:
                if uid is None:
                    raise RuntimeError(f"Creating {type(obj).__name__} without an authenticated user")
                obj.user_id = uid
        elif uid is not None and obj.user_id != uid:
            raise RuntimeError("Refusing to modify another user's row")
        owned = owned or _owned_classes_by_table(session)
        for col in obj.__table__.columns:
            if col.name == "user_id":
                continue
            for fk in col.foreign_keys:
                target = owned.get(fk.column.table.name)
                value = getattr(obj, col.key, None)
                if target is not None and value is not None:
                    links.setdefault((target, fk.column.key), []).append(value)
    _check_links_exist(session, links)


def _check_links_exist(session: Session, links: dict[tuple[type, str], list]) -> None:
    """Every linked row must be visible to the current user (the criteria above filter by owner):
    one query per linked table and column, however many rows the flush writes."""
    for (target, key), values in links.items():
        column = getattr(target, key)
        wanted = list(dict.fromkeys(values))
        with session.no_autoflush:
            found = set(session.scalars(select(column).where(column.in_(wanted))))
        value = next((v for v in wanted if v not in found), None)
        if value is not None:
            raise NotFound(f"{target.__name__} {value} not found")
