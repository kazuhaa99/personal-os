"""Indexes match how the data is read: every foreign key is indexed (deletes and joins), and the
busiest lists, always filtered by owner, have indexes that start with user_id."""

from app.db import Base


def _leading_columns(table) -> set[str]:
    return {list(ix.columns)[0].name for ix in table.indexes if list(ix.columns)} | \
           {list(c.columns)[0].name for c in table.constraints if getattr(c, "columns", None) and c.__class__.__name__ in ("PrimaryKeyConstraint", "UniqueConstraint")}


def test_every_foreign_key_is_indexed():
    missing = [f"{t.name}.{fk.parent.name}" for t in Base.metadata.sorted_tables for fk in t.foreign_keys
               if fk.parent.name not in _leading_columns(t)]
    assert missing == []


def test_owned_lists_are_indexed_by_owner_first():
    tables = Base.metadata.tables
    def has(table, cols):
        return any([c.name for c in ix.columns] == cols for ix in tables[table].indexes)
    assert has("transactions", ["user_id", "date"])
    assert has("tasks", ["user_id", "status", "due_date"])
