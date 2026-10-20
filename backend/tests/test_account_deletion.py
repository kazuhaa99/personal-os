"""Deleting your own account: password-confirmed, removes every row the user owns,
signs the browser out, and never touches anyone else's data."""

from datetime import date

from sqlalchemy import text

from app.db import Base, engine
from app.tenancy import Owned
from tests.test_accounts_auth import outbox, register  # noqa: F401  (fixture)

ADMIN = {"identifier": "admin", "password": "adminuser123"}


def _fill(c):
    """A bit of everything, including rows linked by RESTRICT foreign keys."""
    acc = c.post("/api/accounts", json={"name": "Wallet", "type": "cash", "currency": "KZT", "opening_balance": "100", "opening_date": "2026-01-01"}).json()["id"]
    acc2 = c.post("/api/accounts", json={"name": "Card", "type": "bank", "currency": "KZT", "opening_balance": "0", "opening_date": "2026-01-01"}).json()["id"]
    food = next(x["id"] for x in c.get("/api/categories").json() if x["name"] == "Food and groceries")
    assert c.post("/api/transactions", json={"type": "expense", "amount": "5", "date": "2026-03-01", "account_id": acc, "category_id": food}).status_code == 201
    assert c.post("/api/transactions", json={"type": "transfer", "amount": "5", "date": "2026-03-02", "account_id": acc, "to_account_id": acc2}).status_code == 201
    assert c.put("/api/budgets", json={"category_id": food, "month": "2026-03", "amount": "50"}).status_code == 200
    plan = c.post("/api/installments", json={"name": "Phone", "original_amount": "100", "payment_amount": "10", "default_account_id": acc})
    assert plan.status_code == 201, plan.text
    pay = c.post(f"/api/installments/{plan.json()['id']}/payments", json={"amount": "10", "date": "2026-03-03", "account_id": acc})
    assert pay.status_code == 201, pay.text
    goal = c.post("/api/goals", json={"title": "Save", "milestones": [{"title": "First"}]})
    assert goal.status_code == 201, goal.text
    assert c.post("/api/tasks", json={"title": "t", "goal_id": goal.json()["id"]}).status_code == 201
    habit = c.post("/api/habits", json={"name": "Read"}).json()["id"]
    assert c.put(f"/api/habits/{habit}/completions", json={"date": date.today().isoformat(), "done": True}).status_code == 200


def _owned_rows(user_id: int) -> dict[str, int]:
    with engine.connect() as conn:
        counts = {}
        for t in Base.metadata.sorted_tables:
            if "user_id" in t.c and any(m.local_table is t and issubclass(m.class_, Owned) for m in Base.registry.mappers):
                counts[t.name] = conn.execute(text(f"SELECT count(*) FROM {t.name} WHERE user_id = :u"), {"u": user_id}).scalar()
        return {k: v for k, v in counts.items() if v}


def test_delete_account_removes_everything_and_signs_out(client, outbox):
    # admin owns some data that must survive
    client.post("/api/auth/login", json=ADMIN)
    admin_acc = client.post("/api/accounts", json={"name": "Admin bank", "type": "bank", "currency": "KZT", "opening_balance": "1", "opening_date": "2026-01-01"}).json()["id"]
    client.post("/api/auth/logout"); client.cookies.clear()

    user = register(client, outbox, username="leaver", email="leaver@example.com", password="leaver password")
    _fill(client)
    assert _owned_rows(user["id"])

    r = client.request("DELETE", "/api/auth/me", json={"password": "wrong password"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "password_wrong"
    assert client.get("/api/accounts").status_code == 200  # still there

    r = client.request("DELETE", "/api/auth/me", json={"password": "leaver password"})
    assert r.status_code == 204, r.text
    assert "pos_session" in r.headers.get("set-cookie", "") and "max-age=0" in r.headers["set-cookie"].lower()
    assert _owned_rows(user["id"]) == {}
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users WHERE id = :u"), {"u": user["id"]}).scalar() == 0

    client.cookies.clear()
    assert client.post("/api/auth/login", json={"identifier": "leaver", "password": "leaver password"}).status_code == 401
    # the username and email are free again
    register(client, outbox, username="leaver", email="leaver@example.com", password="leaver password")

    client.post("/api/auth/logout"); client.cookies.clear()
    client.post("/api/auth/login", json=ADMIN)
    assert [a["id"] for a in client.get("/api/accounts").json()] == [admin_acc]


def test_old_session_cookie_dies_with_the_account(client, outbox):
    register(client, outbox, username="ghost", email="ghost@example.com", password="ghost password")
    cookie = client.cookies.get("pos_session")
    assert client.request("DELETE", "/api/auth/me", json={"password": "ghost password"}).status_code == 204
    client.cookies.set("pos_session", cookie)
    assert client.get("/api/accounts").status_code == 401


def test_last_account_cannot_be_deleted(client, outbox):
    client.post("/api/auth/login", json=ADMIN)
    r = client.request("DELETE", "/api/auth/me", json={"password": ADMIN["password"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_account"
    assert client.get("/api/auth/me").json()["authenticated"] is True


def test_delete_needs_sign_in(client, outbox):
    assert client.request("DELETE", "/api/auth/me", json={"password": "x"}).status_code == 401
