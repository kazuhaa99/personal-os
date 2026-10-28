"""Served under a path prefix on a shared domain, the session cookie must stay inside that path
(and be Secure when configured), so it never mixes with the host site's cookies."""

import pytest

from app.config import get_settings

ADMIN = {"identifier": "admin", "password": "adminuser123"}


@pytest.fixture
def under_prefix(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "auth_enabled", True)
    monkeypatch.setattr(s, "cookie_path", "/personalos/")
    monkeypatch.setattr(s, "cookie_secure", True)
    from app.api import throttle
    throttle.reset()


def _cookie(resp) -> str:
    return next(v for k, v in resp.headers.multi_items() if k.lower() == "set-cookie" and v.startswith("pos_session="))


def test_login_cookie_is_scoped_to_the_prefix(client, under_prefix):
    c = _cookie(client.post("/api/auth/login", json=ADMIN))
    assert "Path=/personalos/" in c and "Secure" in c and "HttpOnly" in c


def test_logout_clears_the_cookie_on_the_same_path(client, under_prefix):
    client.post("/api/auth/login", json=ADMIN)
    c = _cookie(client.post("/api/auth/logout"))
    assert "Path=/personalos/" in c and "Max-Age=0" in c


def test_default_path_is_root(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_enabled", True)
    from app.api import throttle
    throttle.reset()
    assert "Path=/;" in _cookie(client.post("/api/auth/login", json=ADMIN)) + ";"
