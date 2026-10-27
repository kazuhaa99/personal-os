"""Signing out of the web app ends that session on the server: a copy of the cookie (another
tab's, a stolen one) stops working too, while the account's other devices stay signed in."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models import RevokedWebSession
from app.services import auth as svc
from tests.test_accounts_auth import outbox  # noqa: F401  (fixture)

ADMIN = {"identifier": "admin", "password": "adminuser123"}


def _signed_in_cookie(client) -> str:
    assert client.post("/api/auth/login", json=ADMIN).status_code == 200
    return client.cookies[svc.SESSION_COOKIE]


def test_a_signed_out_cookie_no_longer_works(client, outbox):  # noqa: F811
    cookie = _signed_in_cookie(client)
    assert client.post("/api/auth/logout").status_code == 204

    client.cookies.set(svc.SESSION_COOKIE, cookie)
    assert client.get("/api/auth/me").json()["authenticated"] is False
    assert client.get("/api/accounts").status_code == 401


def test_other_sessions_of_the_account_stay_signed_in(client, outbox):  # noqa: F811
    other = _signed_in_cookie(client)
    client.cookies.clear()
    _signed_in_cookie(client)
    assert client.post("/api/auth/logout").status_code == 204

    client.cookies.set(svc.SESSION_COOKIE, other)
    assert client.get("/api/accounts").status_code == 200


def test_signing_out_without_a_valid_cookie_is_harmless(client, outbox, db):  # noqa: F811
    client.cookies.set(svc.SESSION_COOKIE, "1|0|9999999999|abcd|forged")
    assert client.post("/api/auth/logout").status_code == 204
    assert db.scalar(select(func.count()).select_from(RevokedWebSession)) == 0


def test_expired_revocations_are_cleaned_up(client, outbox, db):  # noqa: F811
    db.add(RevokedWebSession(token_id="0" * 16, expires_at=datetime.now(timezone.utc) - timedelta(days=1)))
    db.commit()
    _signed_in_cookie(client)
    client.post("/api/auth/logout")
    assert [r.token_id for r in db.scalars(select(RevokedWebSession))] != ["0" * 16]
    assert db.scalar(select(func.count()).select_from(RevokedWebSession)) == 1
