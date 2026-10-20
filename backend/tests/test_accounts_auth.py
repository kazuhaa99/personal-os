"""Accounts: registration with email confirmation, login by username or email,
password reset, and strict per-user isolation of data."""

import re

import pytest

from app.config import get_settings
from app.services import mail


@pytest.fixture
def outbox(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    s = get_settings()
    monkeypatch.setattr(s, "auth_enabled", True)
    monkeypatch.setattr(s, "smtp_password", "app-password")
    monkeypatch.setattr(mail, "send", lambda to, subject, text: sent.append((to, subject, text)))
    from app.api import auth as auth_api
    auth_api._hits.clear()
    return sent


def code_from(outbox) -> str:
    return re.search(r"\b(\d{6})\b", outbox[-1][2]).group(1)


def register(c, outbox, username="aru", email="aru@example.com", password="correct horse"):
    r = c.post("/api/auth/register", json={"username": username, "email": email, "password": password})
    assert r.status_code == 201, r.text
    r = c.post("/api/auth/verify-email", json={"identifier": email, "code": code_from(outbox)})
    assert r.status_code == 200, r.text
    return r.json()["user"]


def test_register_confirm_and_login_with_username_or_email(client, outbox):
    r = client.post("/api/auth/register", json={"username": "Aru_99", "email": "Aru@Example.com", "password": "correct horse"})
    assert r.status_code == 201 and r.json()["username"] == "aru_99"
    to, subject, _ = outbox[-1]
    assert to == "aru@example.com" and "Personal OS" in subject
    # Not signed in until confirmed; login tells the UI to ask for the code
    assert client.get("/api/accounts").status_code == 401
    r = client.post("/api/auth/login", json={"identifier": "aru_99", "password": "correct horse"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_unverified"
    assert client.post("/api/auth/verify-email", json={"identifier": "aru_99", "code": "000000" if code_from(outbox) != "000000" else "111111"}).status_code == 422
    r = client.post("/api/auth/verify-email", json={"identifier": "aru_99", "code": code_from(outbox)})
    assert r.status_code == 200 and r.json()["user"]["email_verified"] is True
    assert client.get("/api/accounts").status_code == 200  # signed in by confirmation
    client.post("/api/auth/logout"); client.cookies.clear()
    for ident in ("aru_99", "ARU@example.com"):
        r = client.post("/api/auth/login", json={"identifier": ident, "password": "correct horse"})
        assert r.status_code == 200, ident
        assert "httponly" in r.headers["set-cookie"].lower()
        client.cookies.clear()
    assert client.post("/api/auth/login", json={"identifier": "aru_99", "password": "wrong pass"}).status_code == 401


def test_registration_validation(client, outbox):
    bad = [{"username": "ab", "email": "a@example.com", "password": "12345678"},
           {"username": "ok_name", "email": "nope", "password": "12345678"},
           {"username": "ok_name", "email": "a@example.com", "password": "short"},
           {"username": "admin", "email": "a@example.com", "password": "12345678"}]
    for body in bad:
        assert client.post("/api/auth/register", json=body).status_code == 422, body
    register(client, outbox, "one", "one@example.com")
    r = client.post("/api/auth/register", json={"username": "two", "email": "ONE@example.com", "password": "12345678"})
    assert r.json()["error"]["code"] == "email_taken"


def test_registration_needs_mail(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_enabled", True)
    monkeypatch.setattr(get_settings(), "smtp_password", None)
    monkeypatch.setattr(get_settings(), "mail_dev_log", False)
    assert client.get("/api/auth/me").json()["registration_open"] is False
    r = client.post("/api/auth/register", json={"username": "x_user", "email": "x@example.com", "password": "12345678"})
    assert r.status_code == 503


def test_admin_login_and_tampered_session(client, outbox):
    assert client.get("/api/accounts").status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "admin", "password": "adminuser123"}).status_code == 200
    assert client.get("/api/auth/me").json()["user"]["username"] == "admin"
    client.cookies.clear()
    client.cookies.set("pos_session", "1|0|9999999999|00|deadbeef")
    assert client.get("/api/accounts").status_code == 401


def test_users_never_see_each_others_data(client, outbox):
    # admin creates data
    client.post("/api/auth/login", json={"identifier": "admin", "password": "adminuser123"})
    acc = client.post("/api/accounts", json={"name": "Admin card", "type": "bank", "currency": "KZT", "opening_balance": "100", "opening_date": "2026-01-01"}).json()
    client.post("/api/tasks", json={"title": "Admin secret task"})
    admin_cookie = client.cookies.get("pos_session")
    client.cookies.clear()

    register(client, outbox, "bob", "bob@example.com")
    assert client.get("/api/accounts").json() == []
    tasks = client.get("/api/tasks").json()
    assert "Admin secret task" not in str(tasks)
    assert client.get(f"/api/accounts/{acc['id']}").status_code == 404
    assert client.patch(f"/api/accounts/{acc['id']}", json={"name": "pwned"}).status_code == 404
    assert client.delete(f"/api/accounts/{acc['id']}").status_code == 404
    # Referencing someone else's account in a new transaction is rejected
    cat = next(c["id"] for c in client.get("/api/categories").json() if c["name"] == "Transport")
    r = client.post("/api/transactions", json={"type": "expense", "amount": "5", "account_id": acc["id"], "category_id": cat, "date": "2026-03-01"})
    assert r.status_code in (404, 422)
    # Each user has their own default categories, settings and dashboard
    assert len(client.get("/api/categories").json()) >= 10
    client.patch("/api/settings", json={"timezone": "Europe/Berlin"})
    assert "Admin" not in str(client.get("/api/dashboard").json())
    # Same account name is fine for a different user
    assert client.post("/api/accounts", json={"name": "Admin card", "type": "bank", "currency": "KZT", "opening_balance": "0", "opening_date": "2026-01-01"}).status_code == 201

    client.cookies.clear()
    client.cookies.set("pos_session", admin_cookie)
    names = [a["name"] for a in client.get("/api/accounts").json()]
    assert names == ["Admin card"]
    assert client.get("/api/settings").json()["timezone"] == "Asia/Almaty"


def test_password_reset_signs_out_other_sessions(client, outbox):
    register(client, outbox, "carol", "carol@example.com", "first password")
    old_cookie = client.cookies.get("pos_session")
    client.cookies.clear()
    assert client.post("/api/auth/password/forgot", json={"identifier": "nobody@example.com"}).status_code == 204  # no leak
    n = len(outbox)
    assert client.post("/api/auth/password/forgot", json={"identifier": "carol"}).status_code == 204
    assert len(outbox) == n + 1
    r = client.post("/api/auth/password/reset", json={"identifier": "carol@example.com", "code": code_from(outbox), "password": "second password"})
    assert r.status_code == 200
    client.cookies.clear()
    client.cookies.set("pos_session", old_cookie)
    assert client.get("/api/accounts").status_code == 401  # old session revoked
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"identifier": "carol", "password": "first password"}).status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "carol", "password": "second password"}).status_code == 200


def test_change_password_and_email(client, outbox):
    register(client, outbox, "dan", "dan@example.com", "first password")
    assert client.post("/api/auth/password/change", json={"current_password": "nope", "new_password": "another one"}).status_code == 422
    assert client.post("/api/auth/password/change", json={"current_password": "first password", "new_password": "another one"}).status_code == 200
    assert client.get("/api/accounts").status_code == 200  # this device stays signed in
    r = client.post("/api/auth/email/change", json={"email": "dan2@example.com", "password": "another one"})
    assert r.status_code == 200 and r.json()["pending_email"] == "dan2@example.com"
    assert outbox[-1][0] == "dan2@example.com"
    r = client.post("/api/auth/email/confirm", json={"code": code_from(outbox)})
    assert r.json()["email"] == "dan2@example.com" and r.json()["email_verified"] is True
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"identifier": "dan2@example.com", "password": "another one"}).status_code == 200


def test_code_attempts_and_resend_are_limited(client, outbox):
    client.post("/api/auth/register", json={"username": "eve", "email": "eve@example.com", "password": "12345678"})
    code = code_from(outbox)
    wrong = "000000" if code != "000000" else "111111"
    assert client.post("/api/auth/resend-code", json={"identifier": "eve"}).status_code == 429  # within a minute
    for _ in range(5):
        client.post("/api/auth/verify-email", json={"identifier": "eve", "code": wrong})
    assert client.post("/api/auth/verify-email", json={"identifier": "eve", "code": code}).status_code == 429


def test_registration_can_be_closed(client, outbox, monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_registration", False)
    assert client.post("/api/auth/register", json={"username": "zed", "email": "z@example.com", "password": "12345678"}).status_code == 403


def test_foreign_keys_and_aggregates_are_scoped(client, outbox):
    client.post("/api/auth/login", json={"identifier": "admin", "password": "adminuser123"})
    goal = client.post("/api/goals", json={"title": "Admin goal", "category": "finance"}).json()
    acc = client.post("/api/accounts", json={"name": "A", "type": "cash", "currency": "KZT", "opening_balance": "0", "opening_date": "2026-01-01"}).json()
    cat = next(c["id"] for c in client.get("/api/categories").json() if c["name"] == "Salary")
    from datetime import date
    assert client.post("/api/transactions", json={"type": "income", "amount": "777", "account_id": acc["id"], "category_id": cat, "date": str(date.today())}).status_code == 201
    client.cookies.clear()

    register(client, outbox, "frank", "frank@example.com")
    r = client.post("/api/tasks", json={"title": "sneaky", "goal_id": goal["id"]})
    assert r.status_code in (404, 422)
    r = client.put("/api/budgets", json={"category_id": cat, "amount": "10", "month": date.today().strftime("%Y-%m")})
    assert r.status_code in (404, 422)
    summary = client.get("/api/analytics/summary").json()
    assert "777" not in str(summary)
    assert "777" not in str(client.get("/api/dashboard").json())
    assert client.get("/api/profile").json()["account"]["username"] == "frank"


def test_dashboard_counts_do_not_leak(client, outbox):
    from datetime import date, timedelta
    client.post("/api/auth/login", json={"identifier": "admin", "password": "adminuser123"})
    for d in (date.today(), date.today() - timedelta(days=2)):
        client.post("/api/tasks", json={"title": "admin task", "due_date": str(d)})
    assert client.get("/api/dashboard").json()["tasks"]["counts"]["today"] == 1
    client.cookies.clear()
    register(client, outbox, "gina", "gina@example.com")
    counts = client.get("/api/dashboard").json()["tasks"]["counts"]
    assert counts["today"] == 0 and counts["overdue"] == 0
