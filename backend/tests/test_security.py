from app.config import get_settings


def test_api_token_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "api_token", "s3cret-token")
    assert client.get("/api/accounts").status_code == 401
    assert client.get("/api/accounts", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/accounts", headers={"Authorization": "Bearer s3cret-token"}).status_code == 200


def test_no_token_configured_allows_local_access(client):
    assert client.get("/api/accounts").status_code == 200


def test_cors_only_allows_configured_origins(client):
    ok = client.options("/api/accounts", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    evil = client.options("/api/accounts", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in evil.headers


def test_security_headers_and_error_shape(client):
    r = client.get("/api/transactions/999999")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "no-store"


def test_search_input_is_parameterised(api):
    acc = api.account()
    api.expense(acc, "5", description="normal")
    r = api.c.get("/api/transactions", params={"q": "'; DROP TABLE transactions; --"})
    assert r.status_code == 200 and r.json()["total"] == 0
    assert api.ok(api.c.get("/api/transactions"))["total"] == 1


def test_login_required_when_auth_enabled(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_enabled", True)
    assert client.get("/api/accounts").status_code == 401
    assert client.get("/api/auth/me").json()["authenticated"] is False
    bad = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert bad.status_code == 401
    ok = client.post("/api/auth/login", json={"username": "admin", "password": "adminuser123"})
    assert ok.status_code == 200
    assert "httponly" in ok.headers["set-cookie"].lower()
    assert client.get("/api/accounts").status_code == 200
    assert client.get("/api/auth/me").json() == {"authenticated": True, "username": "admin", "auth_enabled": True}
    client.post("/api/auth/logout")
    client.cookies.clear()
    assert client.get("/api/accounts").status_code == 401


def test_tampered_session_is_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_enabled", True)
    client.cookies.set("pos_session", "admin|9999999999|00|deadbeef")
    assert client.get("/api/accounts").status_code == 401


def test_api_token_still_works_with_login_enabled(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_enabled", True)
    monkeypatch.setattr(get_settings(), "api_token", "s3cret-token")
    assert client.get("/api/accounts", headers={"Authorization": "Bearer s3cret-token"}).status_code == 200
