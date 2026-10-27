"""Guessing passwords and emailed codes must stay slow: parallel requests and a forged client
address must not get around the limits."""

import itertools
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api import auth as auth_api
from app.api import throttle
from app.db import SessionLocal
from app.models import User
from app.services import auth as svc
from app.services import mail
from tests.test_accounts_auth import outbox, register  # noqa: F401  (fixture)

WRONG = {"identifier": "admin", "password": "not-the-password"}


def test_code_attempts_survive_concurrent_requests(db, monkeypatch):
    monkeypatch.setattr(mail, "send", lambda *a: None)
    admin = svc.find_user(db, "admin")
    admin.email = "admin@example.com"
    svc.send_code(db, admin, "reset")

    # Two requests that loaded the account before either counted its wrong code.
    with SessionLocal() as first, SessionLocal() as second:
        stale = [s.get(User, admin.id) for s in (first, second)]
        for session, user in zip((first, second), stale, strict=True):
            with pytest.raises(svc.ValidationFailed):
                svc.check_code(session, user, "reset", "abcdef")

    db.expire_all()
    assert svc.find_user(db, "admin").code_attempts == 2


def _request(host="192.0.2.1"):
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": (host, 1)})


def _login_in_own_session(password):
    with SessionLocal() as session:
        try:
            auth_api._checked_login(_request(), session, "admin", password)
            return 200
        except svc.Unauthorized:
            return 401
        except HTTPException as e:
            return e.status_code


def test_parallel_wrong_logins_cannot_exceed_the_limit(outbox, monkeypatch):  # noqa: F811
    release = threading.Event()
    checked = []
    real = svc.authenticate

    def slow_authenticate(*args):
        checked.append(args[2])
        release.wait(5)  # every request is in flight before any of them fails
        return real(*args)

    monkeypatch.setattr(svc, "authenticate", slow_authenticate)
    attempts = throttle.MAX + 5
    with ThreadPoolExecutor(attempts) as pool:
        futures = [pool.submit(_login_in_own_session, "not-the-password") for _ in range(attempts)]
        time.sleep(0.5)
        release.set()
        codes = sorted(f.result() for f in futures)
    # A correct guess among the extra requests would sign in, so they must not even be checked.
    assert len(checked) == throttle.MAX
    assert codes.count(401) == throttle.MAX, codes
    assert codes.count(429) == 5


def test_a_successful_login_does_not_use_up_the_limit(client, outbox):  # noqa: F811
    for _ in range(throttle.MAX + 2):
        assert client.post("/api/auth/login", json={"identifier": "admin", "password": "adminuser123"}).status_code == 200


def test_login_limit_per_account_holds_across_client_addresses(client, outbox, monkeypatch):  # noqa: F811
    addresses = (f"203.0.113.{i}" for i in itertools.count(1))
    monkeypatch.setattr(throttle, "client", lambda request: next(addresses))
    for _ in range(throttle.ACCOUNT_MAX):
        assert client.post("/api/auth/login", json=WRONG).status_code == 401
    assert client.post("/api/auth/login", json=WRONG).status_code == 429
    assert client.post("/api/auth/login", json={**WRONG, "identifier": "ADMIN "}).status_code == 429


def test_throttle_memory_is_bounded(monkeypatch):
    throttle.reset()
    monkeypatch.setattr(throttle, "MAX_KEYS", 50)
    monkeypatch.setattr(throttle, "WINDOW", 0)  # every earlier hit is already stale
    for i in range(200):
        throttle.take(("login", f"198.51.100.{i}"))
    assert len(throttle._hits) <= 50


def test_username_and_email_share_the_account_limit(client, outbox, monkeypatch):  # noqa: F811
    register(client, outbox, username="lina", email="lina@example.com", password="lina's password")
    client.cookies.clear()
    addresses = (f"203.0.113.{i}" for i in itertools.count(1))
    monkeypatch.setattr(throttle, "client", lambda request: next(addresses))
    for i in range(throttle.ACCOUNT_MAX):
        identifier = "lina" if i % 2 else "LINA@example.com"
        assert client.post("/api/auth/login", json={"identifier": identifier, "password": "guess"}).status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "lina", "password": "guess"}).status_code == 429


def test_guessing_elsewhere_does_not_lock_out_a_device_that_signed_in_before(client, outbox, monkeypatch):  # noqa: F811
    owner = "192.0.2.10"
    current = {"address": owner}
    monkeypatch.setattr(throttle, "client", lambda request: current["address"])
    assert client.post("/api/auth/login", json={"identifier": "admin", "password": "adminuser123"}).status_code == 200

    for i in range(throttle.ACCOUNT_MAX):
        current["address"] = f"203.0.113.{i + 1}"
        client.post("/api/auth/login", json=WRONG)
    current["address"] = "203.0.113.200"
    assert client.post("/api/auth/login", json=WRONG).status_code == 429  # strangers are locked out

    current["address"] = owner
    assert client.post("/api/auth/login", json={"identifier": "admin", "password": "adminuser123"}).status_code == 200
