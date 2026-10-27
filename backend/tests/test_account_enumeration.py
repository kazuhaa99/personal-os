"""Endpoints anyone can call must answer the same whether or not an account exists, even when
sending the email fails or is rate-limited; and they must never claim a code went out when it didn't."""

import pytest

from app.services import mail
from tests.test_accounts_auth import code_from, outbox, register  # noqa: F401  (fixture)


def _break_mail(monkeypatch):
    def fail(*_):
        raise mail.MailUnavailable("Could not send the email. Check the SMTP settings and try again.")

    monkeypatch.setattr(mail, "send", fail)


@pytest.fixture
def verified(client, outbox):  # noqa: F811
    return register(client, outbox, username="vera", email="vera@example.com")


def test_forgot_password_is_204_even_when_mail_fails(client, verified, monkeypatch):
    _break_mail(monkeypatch)
    for identifier in ("vera", "nobody-here"):
        assert client.post("/api/auth/password/forgot", json={"identifier": identifier}).status_code == 204


def test_resend_code_is_204_for_known_unknown_and_too_soon(client, outbox, monkeypatch):  # noqa: F811
    client.post("/api/auth/register", json={"username": "uma", "email": "uma@example.com", "password": "12345678"})
    for identifier in ("uma", "uma", "nobody-here"):  # the second one is within the resend minute
        assert client.post("/api/auth/resend-code", json={"identifier": identifier}).status_code == 204
    _break_mail(monkeypatch)
    assert client.post("/api/auth/resend-code", json={"identifier": "uma"}).status_code == 204


def test_sign_in_does_not_claim_a_code_was_sent_when_mail_failed(client, outbox, monkeypatch):  # noqa: F811
    client.post("/api/auth/register", json={"username": "ola", "email": "ola@example.com", "password": "12345678"})
    _break_mail(monkeypatch)
    from app.db import SessionLocal
    from app.services import auth as svc

    with SessionLocal() as db:  # the first code has expired: signing in must send a new one
        user = svc.find_user(db, "ola")
        user.code_purpose = user.code_hash = user.code_expires_at = user.code_sent_at = None
        db.commit()

    r = client.post("/api/auth/login", json={"identifier": "ola", "password": "12345678"})
    assert r.status_code == 403
    error = r.json()["error"]
    assert error["code"] == "email_unverified"
    assert error["details"]["code_sent"] is False
    assert "We sent" not in error["message"]


def test_sign_in_reports_the_code_it_sent(client, outbox):  # noqa: F811
    client.post("/api/auth/register", json={"username": "pia", "email": "pia@example.com", "password": "12345678"})
    r = client.post("/api/auth/login", json={"identifier": "pia", "password": "12345678"})
    assert r.status_code == 403
    assert r.json()["error"]["details"] == {"email": "pia@example.com", "code_sent": True}
