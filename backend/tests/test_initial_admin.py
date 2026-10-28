"""The first account must never come with a password anyone can read in the repository."""

import logging

import pytest
from sqlalchemy import delete

from app.config import Settings, get_settings
from app.models import User
from app.services import auth as svc


def _fresh_install(db, monkeypatch, password):
    monkeypatch.setattr(get_settings(), "auth_password", password)
    db.execute(delete(User))
    db.commit()


def test_no_password_in_settings_by_default(monkeypatch):
    monkeypatch.delenv("POS_AUTH_PASSWORD", raising=False)
    assert Settings(_env_file=None).auth_password is None


def test_without_a_configured_password_a_random_one_is_logged(db, monkeypatch, caplog):
    _fresh_install(db, monkeypatch, None)
    with caplog.at_level(logging.WARNING, logger="personal_os"):
        svc.ensure_admin(db)
    admin = svc.find_user(db, "admin")
    assert admin is not None
    assert not svc.verify_password("adminuser123", admin.password_hash)
    logged = [r.getMessage() for r in caplog.records if "admin" in r.getMessage()]
    assert len(logged) == 1
    password = logged[0].rsplit(" ", 1)[-1]
    assert len(password) >= 16 and svc.verify_password(password, admin.password_hash)


def test_an_empty_password_counts_as_unset(db, monkeypatch):
    _fresh_install(db, monkeypatch, "")
    svc.ensure_admin(db)
    assert not svc.verify_password("", svc.find_user(db, "admin").password_hash)


def test_a_configured_password_is_used_and_never_logged(db, monkeypatch, caplog):
    _fresh_install(db, monkeypatch, "a-long-chosen-secret")
    with caplog.at_level(logging.DEBUG):
        svc.ensure_admin(db)
    assert svc.verify_password("a-long-chosen-secret", svc.find_user(db, "admin").password_hash)
    assert "a-long-chosen-secret" not in caplog.text


def test_a_too_short_configured_password_is_refused(db, monkeypatch):
    _fresh_install(db, monkeypatch, "short")
    with pytest.raises(RuntimeError, match="POS_AUTH_PASSWORD"):
        svc.ensure_admin(db)
    assert svc.find_user(db, "admin") is None


# ------------------------------------------------------------------ password hashing strength

def _params(stored: str) -> tuple[int, int, int]:
    _, n, r, p, _, _ = stored.split("$")
    return int(n), int(r), int(p)


@pytest.fixture
def real_cost(monkeypatch):
    monkeypatch.setattr(svc, "_SCRYPT", svc.SCRYPT_COST)


def test_new_passwords_use_the_owasp_scrypt_cost(real_cost):
    # OWASP: N=2^16, r=8, p=2 equals N=2^17, p=1 in work, with half the memory per sign-in.
    assert _params(svc.hash_password("a password")) == (2**16, 8, 2)


def test_an_older_weaker_hash_still_works_and_is_upgraded_on_sign_in(db, real_cost):
    admin = svc.find_user(db, "admin")
    old = svc.hash_password("adminuser123", n=2**14, r=8, p=1)
    admin.password_hash = old
    db.commit()

    svc.authenticate(db, "admin", "adminuser123")
    db.expire_all()
    upgraded = svc.find_user(db, "admin").password_hash
    assert upgraded != old and _params(upgraded) == (2**16, 8, 2)
    assert svc.verify_password("adminuser123", upgraded)
