"""Row-level security: the database itself refuses to show or write another user's rows,
even for raw SQL that never passes through the ORM's tenancy hooks.

The isolation checks need the app to connect as a non-superuser role (RLS mode, see
conftest.py); with a superuser connection they are skipped, because Postgres lets
superusers bypass RLS by design.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app import rls
from app.db import SessionLocal, engine
from app.models import User
from app.schemas.finance import AccountCreate
from app.services import accounts
from app.services.auth import first_user_id, hash_password
from app.tenancy import acting_as
from tests.conftest import owner_engine


def test_every_owned_table_has_a_forced_policy():
    with owner_engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, "
            "EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = :p) AS has_policy "
            "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'"),
            {"p": rls.POLICY}).all()
    state = {r.relname: (r.relrowsecurity, r.relforcerowsecurity, r.has_policy) for r in rows}
    for table in rls.owned_tables():
        assert state[table] == (True, True, True), table
    assert state["users"][0] is False  # sign-in must find users before anyone is known


@pytest.fixture
def two_users():
    with SessionLocal() as db:
        admin = first_user_id(db)
        bob = User(username="bob", email="", password_hash=hash_password("bob password"), code_attempts=0, session_epoch=0)
        db.add(bob)
        db.commit()
        for uid, name in ((admin, "Admin cash"), (bob.id, "Bob cash")):
            with acting_as(uid):
                accounts.create_account(db, AccountCreate(name=name, type="cash"))
        return admin, bob.id


def _rls_or_skip():
    if not rls.check_role(engine)["rls_effective"]:
        pytest.skip("app connects as a role that bypasses RLS (set POS_TEST_OWNER_DATABASE_URL to test RLS mode)")


def _raw(conn, uid, sql, **params):
    conn.execute(text("SELECT set_config('app.user_id', :u, true)"), {"u": "" if uid is None else str(uid)})
    return conn.execute(text(sql), params)


def test_raw_sql_sees_only_own_rows(two_users):
    _rls_or_skip()
    admin, bob = two_users
    with engine.begin() as conn:
        assert _raw(conn, admin, "SELECT name FROM accounts").scalars().all() == ["Admin cash"]
        assert _raw(conn, bob, "SELECT name FROM accounts").scalars().all() == ["Bob cash"]
        assert _raw(conn, None, "SELECT count(*) FROM accounts").scalar() == 0  # nobody signed in: nothing
        # writes to someone else's rows silently match nothing
        assert _raw(conn, admin, "UPDATE accounts SET name = 'hacked' WHERE user_id = :b", b=bob).rowcount == 0
        assert _raw(conn, admin, "DELETE FROM accounts WHERE user_id = :b", b=bob).rowcount == 0
    with owner_engine.connect() as conn:
        assert conn.execute(text("SELECT name FROM accounts WHERE user_id = :b"), {"b": bob}).scalar() == "Bob cash"


def test_cannot_insert_rows_for_someone_else(two_users):
    _rls_or_skip()
    admin, bob = two_users
    with pytest.raises(DBAPIError, match="row-level security"):
        with engine.begin() as conn:
            _raw(conn, admin, "INSERT INTO accounts (user_id, name, type, currency, opening_balance, opening_date, is_archived, is_demo, created_at, updated_at) "
                              "VALUES (:b, 'planted', 'cash', 'KZT', 0, CURRENT_DATE, false, false, now(), now())", b=bob)


def test_session_setting_follows_the_current_user_after_rollback(two_users):
    _rls_or_skip()
    admin, bob = two_users
    with SessionLocal() as db:
        with acting_as(admin):
            assert db.execute(text("SELECT name FROM accounts")).scalars().all() == ["Admin cash"]
            db.rollback()  # also undoes set_config; the hook must notice
        with acting_as(bob):
            assert db.execute(text("SELECT name FROM accounts")).scalars().all() == ["Bob cash"]
        with acting_as(None):  # nobody signed in (tests otherwise act as the first account)
            assert db.execute(text("SELECT count(*) FROM accounts")).scalar() == 0
