"""Bearer tokens for the native shells (Capacitor on iOS, Tauri on macOS).

Their WebViews run on capacitor://localhost / tauri://localhost, so the web's
SameSite=Strict session cookie never reaches the API. They sign in for an
access + refresh token pair instead; the web keeps using the cookie.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.config import Settings, get_settings
from app.db import engine
from app.services import native_tokens
from tests.test_accounts_auth import code_from, outbox, register  # noqa: F401  (fixture re-export)

ADMIN = {"identifier": "admin", "password": "adminuser123"}


def issue(c, creds=ADMIN, **extra) -> dict:
    r = c.post("/api/auth/token", json={**creds, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def refresh(c, token: str):
    return c.post("/api/auth/token/refresh", json={"refresh_token": token})


def test_sign_in_returns_a_token_pair_and_no_cookie(client, outbox):
    r = client.post("/api/auth/token", json={**ADMIN, "device_name": "iPhone"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "Bearer"
    assert body["access_token"] != body["refresh_token"]
    assert body["expires_in"] == get_settings().native_access_minutes * 60
    assert body["refresh_expires_in"] == get_settings().native_refresh_days * 86400
    assert body["user"]["username"] == "admin"
    assert "set-cookie" not in r.headers
    assert not client.cookies


def test_access_token_opens_the_api_and_auth_me(client, outbox):
    tokens = issue(client)
    assert client.get("/api/accounts").status_code == 401
    assert client.get("/api/accounts", headers=bearer(tokens["access_token"])).status_code == 200
    me = client.get("/api/auth/me", headers=bearer(tokens["access_token"])).json()
    assert me["authenticated"] is True and me["user"]["username"] == "admin"
    # The refresh token is not an access token
    assert client.get("/api/accounts", headers=bearer(tokens["refresh_token"])).status_code == 401
    assert client.get("/api/accounts", headers=bearer("posat_forged")).status_code == 401


def test_wrong_password_and_unverified_email(client, outbox):
    r = client.post("/api/auth/token", json={"identifier": "admin", "password": "wrong password"})
    assert r.status_code == 401
    client.post("/api/auth/register", json={"username": "newbie", "email": "new@example.com", "password": "correct horse"})
    r = client.post("/api/auth/token", json={"identifier": "newbie", "password": "correct horse"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_unverified"


def test_bearer_users_never_see_each_others_data(client, outbox):
    admin = issue(client)
    acc = client.post("/api/accounts", headers=bearer(admin["access_token"]), json={
        "name": "Admin card", "type": "bank", "currency": "KZT", "opening_balance": "100", "opening_date": "2026-01-01"}).json()
    register(client, outbox, "bob", "bob@example.com")
    client.cookies.clear()
    bob = issue(client, {"identifier": "bob", "password": "correct horse"})
    h = bearer(bob["access_token"])
    assert client.get("/api/accounts", headers=h).json() == []
    assert client.get(f"/api/accounts/{acc['id']}", headers=h).status_code == 404
    assert client.patch(f"/api/accounts/{acc['id']}", headers=h, json={"name": "pwned"}).status_code == 404
    assert [a["name"] for a in client.get("/api/accounts", headers=bearer(admin["access_token"])).json()] == ["Admin card"]


def at(monkeypatch, **delta):
    """Set the token clock to the real now + `delta` (not cumulative across calls)."""
    later = datetime.now(timezone.utc) + timedelta(**delta)
    monkeypatch.setattr(native_tokens, "_now", lambda: later)


def test_refresh_rotates_and_a_replayed_refresh_token_revokes_the_session(client, outbox, monkeypatch):
    first = issue(client)
    r = refresh(client, first["refresh_token"])
    assert r.status_code == 200
    second = r.json()
    assert second["refresh_token"] != first["refresh_token"] and second["access_token"] != first["access_token"]
    assert client.get("/api/accounts", headers=bearer(second["access_token"])).status_code == 200
    # The old access token died with the rotation
    assert client.get("/api/accounts", headers=bearer(first["access_token"])).status_code == 401
    # Long after the rotation someone replays the old refresh token: refused, whole session revoked
    at(monkeypatch, seconds=native_tokens.REFRESH_RETRY_GRACE.total_seconds() + 1)
    assert refresh(client, first["refresh_token"]).status_code == 401
    assert client.get("/api/accounts", headers=bearer(second["access_token"])).status_code == 401
    assert refresh(client, second["refresh_token"]).status_code == 401


def test_a_refresh_token_replayed_generations_later_still_revokes_the_session(client, outbox, monkeypatch):
    tokens = [issue(client)]
    for minutes in (1, 2, 3):
        at(monkeypatch, minutes=minutes)
        tokens.append(refresh(client, tokens[-1]["refresh_token"]).json())
    assert refresh(client, tokens[0]["refresh_token"]).status_code == 401
    assert client.get("/api/accounts", headers=bearer(tokens[-1]["access_token"])).status_code == 401
    assert refresh(client, tokens[-1]["refresh_token"]).status_code == 401


def test_retrying_a_refresh_whose_response_was_lost_does_not_sign_out(client, outbox):
    first = issue(client)
    lost = refresh(client, first["refresh_token"]).json()  # the app never received this
    r = refresh(client, first["refresh_token"])  # ... so it retries right away
    assert r.status_code == 200
    retried = r.json()
    assert client.get("/api/accounts", headers=bearer(retried["access_token"])).status_code == 200
    assert client.get("/api/accounts", headers=bearer(lost["access_token"])).status_code == 401
    assert refresh(client, retried["refresh_token"]).status_code == 200


def test_sessions_have_an_absolute_lifetime(client, outbox, monkeypatch):
    tokens = issue(client)
    for days in (50, 100, 150):
        at(monkeypatch, days=days)
        r = refresh(client, tokens["refresh_token"])
        assert r.status_code == 200, days
        tokens = r.json()
    assert tokens["refresh_expires_in"] <= 30 * 86400  # capped by the session's age, not 60 more days
    at(monkeypatch, days=get_settings().native_session_max_days, seconds=1)
    assert refresh(client, tokens["refresh_token"]).status_code == 401


def test_tokens_stop_working_when_the_email_becomes_unverified(client, outbox):
    tokens = issue(client)
    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET email = 'admin@example.com', email_verified_at = NULL WHERE username = 'admin'"))
    assert client.get("/api/accounts", headers=bearer(tokens["access_token"])).status_code == 401
    assert refresh(client, tokens["refresh_token"]).status_code == 401


def test_signing_in_clears_expired_sessions_and_caps_the_rest(client, outbox, monkeypatch):
    issue(client)
    at(monkeypatch, days=get_settings().native_refresh_days, seconds=1)
    fresh = [issue(client) for _ in range(native_tokens.MAX_SESSIONS_PER_USER + 1)]
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM native_sessions")).scalar() == native_tokens.MAX_SESSIONS_PER_USER
    assert refresh(client, fresh[0]["refresh_token"]).status_code == 401  # the oldest was evicted
    assert refresh(client, fresh[-1]["refresh_token"]).status_code == 200


def test_access_token_expires_but_refresh_still_works(client, outbox, monkeypatch):
    tokens = issue(client)
    later = native_tokens._now() + timedelta(minutes=get_settings().native_access_minutes, seconds=1)
    monkeypatch.setattr(native_tokens, "_now", lambda: later)
    assert client.get("/api/accounts", headers=bearer(tokens["access_token"])).status_code == 401
    r = refresh(client, tokens["refresh_token"])
    assert r.status_code == 200
    assert client.get("/api/accounts", headers=bearer(r.json()["access_token"])).status_code == 200


def test_refresh_token_expires(client, outbox, monkeypatch):
    tokens = issue(client)
    later = native_tokens._now() + timedelta(days=get_settings().native_refresh_days, seconds=1)
    monkeypatch.setattr(native_tokens, "_now", lambda: later)
    assert refresh(client, tokens["refresh_token"]).status_code == 401


def test_sign_out_revokes_both_tokens(client, outbox):
    tokens = issue(client)
    other = issue(client, device_name="Mac")
    assert client.post("/api/auth/token/revoke", headers=bearer(tokens["access_token"])).status_code == 204
    assert client.get("/api/accounts", headers=bearer(tokens["access_token"])).status_code == 401
    assert refresh(client, tokens["refresh_token"]).status_code == 401
    # Only this device signed out
    assert client.get("/api/accounts", headers=bearer(other["access_token"])).status_code == 200
    assert client.post("/api/auth/token/revoke").status_code == 401


def test_password_change_keeps_this_device_and_signs_out_the_others(client, outbox):
    register(client, outbox, "dan", "dan@example.com", "first password")
    client.cookies.clear()
    creds = {"identifier": "dan", "password": "first password"}
    phone, mac = issue(client, creds), issue(client, creds)
    r = client.post("/api/auth/password/change", headers=bearer(phone["access_token"]),
                    json={"current_password": "first password", "new_password": "second password"})
    assert r.status_code == 200
    assert "set-cookie" not in r.headers  # a native caller gets no cookie
    assert client.get("/api/accounts", headers=bearer(phone["access_token"])).status_code == 200
    assert refresh(client, phone["refresh_token"]).status_code == 200
    assert client.get("/api/accounts", headers=bearer(mac["access_token"])).status_code == 401
    assert refresh(client, mac["refresh_token"]).status_code == 401


def test_password_reset_revokes_every_native_session(client, outbox):
    register(client, outbox, "carol", "carol@example.com", "first password")
    client.cookies.clear()
    tokens = issue(client, {"identifier": "carol", "password": "first password"})
    client.post("/api/auth/password/forgot", json={"identifier": "carol"})
    r = client.post("/api/auth/password/reset", json={"identifier": "carol", "code": code_from(outbox), "password": "second password"})
    assert r.status_code == 200
    client.cookies.clear()
    assert client.get("/api/accounts", headers=bearer(tokens["access_token"])).status_code == 401
    assert refresh(client, tokens["refresh_token"]).status_code == 401


def test_deleting_the_account_removes_its_native_sessions(client, outbox):
    user = register(client, outbox, "leaver", "leaver@example.com", "leaver password")
    client.cookies.clear()
    tokens = issue(client, {"identifier": "leaver", "password": "leaver password"})
    r = client.request("DELETE", "/api/auth/me", headers=bearer(tokens["access_token"]), json={"password": "leaver password"})
    assert r.status_code == 204
    assert refresh(client, tokens["refresh_token"]).status_code == 401
    with engine.connect() as conn:
        left = conn.execute(text("SELECT count(*) FROM native_sessions WHERE user_id = :u"), {"u": user["id"]}).scalar()
    assert left == 0


def test_tokens_are_stored_only_as_hashes(client, outbox):
    tokens = issue(client)
    with engine.connect() as conn:
        dump = str(conn.execute(text("SELECT * FROM native_sessions")).all())
    assert tokens["access_token"] not in dump and tokens["refresh_token"] not in dump


def test_token_sign_in_shares_the_login_rate_limit(client, outbox):
    for _ in range(10):
        assert client.post("/api/auth/token", json={"identifier": "admin", "password": "wrong password"}).status_code == 401
    assert client.post("/api/auth/token", json=ADMIN).status_code == 429
    assert client.post("/api/auth/login", json=ADMIN).status_code == 429


def test_failed_refreshes_are_rate_limited(client, outbox):
    for _ in range(10):
        assert refresh(client, "posrt_garbage").status_code == 401
    assert refresh(client, "posrt_garbage").status_code == 429


def test_successful_refreshes_do_not_use_up_the_limit(client, outbox):
    tokens = issue(client)
    for _ in range(15):
        r = refresh(client, tokens["refresh_token"])
        assert r.status_code == 200
        tokens = r.json()


def test_token_responses_are_never_cached(client, outbox):
    r = client.post("/api/auth/token", json=ADMIN)
    assert r.headers.get("cache-control") == "no-store"
    assert refresh(client, r.json()["refresh_token"]).headers.get("cache-control") == "no-store"


def test_cookie_login_is_unchanged(client, outbox):
    r = client.post("/api/auth/login", json=ADMIN)
    assert r.status_code == 200 and "access_token" not in r.json()
    assert "httponly" in r.headers["set-cookie"].lower()


def test_shared_api_token_still_works(client, outbox, monkeypatch):
    monkeypatch.setattr(get_settings(), "api_token", "script-secret")
    assert client.get("/api/accounts", headers=bearer("script-secret")).status_code == 200
    assert client.get("/api/accounts", headers=bearer("posat_script-secret")).status_code == 401
    # ... but /auth/me only answers for real sign-ins, as before
    assert client.get("/api/auth/me", headers=bearer("script-secret")).json()["authenticated"] is False


@pytest.mark.parametrize("origin", ["capacitor://localhost", "tauri://localhost"])
def test_cors_allows_the_native_shells(client, origin):
    r = client.options("/api/accounts", headers={
        "Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
    assert r.headers.get("access-control-allow-origin") == origin
    assert "authorization" in r.headers.get("access-control-allow-headers", "").lower()
    assert "access-control-allow-credentials" not in r.headers


def test_cors_origins_never_include_a_wildcard():
    s = Settings(cors_origins="*, https://app.example", native_origins="*,capacitor://localhost")
    assert "*" not in s.cors_origin_list
    assert set(s.cors_origin_list) == {"https://app.example", "capacitor://localhost"}
