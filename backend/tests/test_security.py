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
