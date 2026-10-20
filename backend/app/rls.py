"""Postgres Row-Level Security: per-user isolation enforced by the database itself.

The ORM hooks in app/tenancy.py already scope every query to the signed-in user.
RLS is the second, independent wall: even a query that slips past them (a raw
statement, a future bug) can only see rows whose user_id matches the session
setting `app.user_id`.

- Every Owned table gets ENABLE + FORCE ROW LEVEL SECURITY and one policy,
  `pos_owner`: USING / WITH CHECK  user_id = app.user_id. With the setting
  empty (no one signed in) nothing is visible and nothing can be written.
- The app must connect as a role that is NOT a superuser and has no BYPASSRLS
  (superusers ignore RLS entirely). Migrations run as the owner role
  (POS_MIGRATION_DATABASE_URL); the app runs as POS_APP_DB_ROLE.
- `install(engine)` keeps app.user_id in step with tenancy.current_user_id()
  before every statement the app sends.
"""

import logging

from sqlalchemy import event, text
from sqlalchemy.engine import Connection, Engine

log = logging.getLogger("personal_os.rls")

POLICY = "pos_owner"
GUC = "app.user_id"
_PREDICATE = f"user_id = NULLIF(current_setting('{GUC}', true), '')::int"
_CACHE_KEY = "pos_rls_uid"


def owned_tables() -> list[str]:
    from app import models  # noqa: F401  (register mappers)
    from app.db import Base
    from app.tenancy import Owned

    names = {m.local_table.name for m in Base.registry.mappers if issubclass(m.class_, Owned)}
    return [t.name for t in Base.metadata.sorted_tables if t.name in names]


def enable_statements(tables: list[str] | None = None) -> list[str]:
    out = []
    for t in tables if tables is not None else owned_tables():
        out += [
            f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY",
            f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY",
            f"DROP POLICY IF EXISTS {POLICY} ON {t}",
            f"CREATE POLICY {POLICY} ON {t} USING ({_PREDICATE}) WITH CHECK ({_PREDICATE})",
        ]
    return out


def disable_statements(tables: list[str] | None = None) -> list[str]:
    out = []
    for t in tables if tables is not None else owned_tables():
        out += [f"DROP POLICY IF EXISTS {POLICY} ON {t}", f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY",
                f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY"]
    return out


def grant_statements(role: str) -> list[str]:
    """Data access for the app role, if that role exists (it is created outside migrations)."""
    q = role.replace('"', '""')
    body = f"""
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role.replace("'", "''")}') THEN
      GRANT USAGE ON SCHEMA public TO "{q}";
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{q}";
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "{q}";
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "{q}";
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "{q}";
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alembic_version') THEN
        REVOKE ALL ON alembic_version FROM "{q}";
      END IF;
    END IF;"""
    return [f"DO $$ BEGIN {body} END $$"]


def install(engine: Engine) -> None:
    """Send app.user_id before any statement whose user differs from what the connection has."""
    from app.tenancy import current_user_id

    @event.listens_for(engine, "before_cursor_execute")
    def _set_user(conn: Connection, cursor, statement, parameters, context, executemany):
        uid = current_user_id()
        want = "" if uid is None else str(uid)
        if conn.info.get(_CACHE_KEY) != want:
            cursor.execute("SELECT set_config(%s, %s, false)", (GUC, want))
            conn.info[_CACHE_KEY] = want

    # A rolled-back transaction also rolls back set_config, so forget what we sent.
    def _forget(conn: Connection, *_args) -> None:
        conn.info.pop(_CACHE_KEY, None)

    event.listen(engine, "rollback", _forget)
    event.listen(engine, "rollback_savepoint", _forget)

    @event.listens_for(engine.pool, "checkin")
    def _forget_raw(dbapi_conn, record):
        record.info.pop(_CACHE_KEY, None)


def check_role(engine: Engine) -> dict:
    """Is RLS actually in force for this connection? (superuser / BYPASSRLS ignore it)"""
    with engine.connect() as conn:
        row = conn.execute(text("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).one()
    effective = not (row.rolsuper or row.rolbypassrls)
    if not effective:
        log.warning("Connected to Postgres as %s, which bypasses row-level security; per-user isolation relies on the "
                    "ORM only. Run the app as a non-superuser role (POS_DATABASE_URL) and migrations as the owner "
                    "(POS_MIGRATION_DATABASE_URL).", row.current_user)
    return {"role": row.current_user, "rls_effective": effective}
