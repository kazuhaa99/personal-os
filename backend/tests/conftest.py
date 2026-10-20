import os

os.environ.setdefault(
    "POS_DATABASE_URL", "postgresql+psycopg://personal_os:personal_os_dev@localhost:5432/personal_os_test"
)
os.environ["POS_API_TOKEN"] = ""
os.environ["POS_AUTH_ENABLED"] = "false"

from datetime import date  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.auth import ensure_admin, first_user_id  # noqa: E402
from app.tenancy import set_current_user  # noqa: E402

assert "test" in str(engine.url.database), "tests must never run against the real database"


@pytest.fixture(scope="session", autouse=True)
def schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def clean():
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        ensure_admin(db)
        # Direct service calls in tests act as the first account (as the API does with auth disabled).
        set_current_user(first_user_id(db))
    yield
    set_current_user(None)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class Api:
    """Small helper so tests read like workflows."""

    def __init__(self, client: TestClient):
        self.c = client
        self._cats = None

    def ok(self, resp, status=(200, 201, 204)):
        assert resp.status_code in ((status,) if isinstance(status, int) else status), resp.text
        return resp.json() if resp.content else None

    def cat(self, name: str) -> int:
        if self._cats is None:
            self._cats = {c["name"]: c["id"] for c in self.c.get("/api/categories").json()}
        return self._cats[name]

    def account(self, name="Main", opening="0", type="bank", currency="KZT", opening_date="2026-01-01") -> int:
        return self.ok(self.c.post("/api/accounts", json={
            "name": name, "type": type, "currency": currency, "opening_balance": opening,
            "opening_date": opening_date}))["id"]

    def expense(self, account_id, amount, d="2026-03-10", category="Food and groceries", **kw):
        return self.ok(self.c.post("/api/transactions", json={
            "type": "expense", "amount": amount, "date": d, "account_id": account_id,
            "category_id": self.cat(category), **kw}))

    def income(self, account_id, amount, d="2026-03-05", category="Salary", **kw):
        return self.ok(self.c.post("/api/transactions", json={
            "type": "income", "amount": amount, "date": d, "account_id": account_id,
            "category_id": self.cat(category), **kw}))

    def transfer(self, src, dst, amount, d="2026-03-06"):
        return self.ok(self.c.post("/api/transactions", json={
            "type": "transfer", "amount": amount, "date": d, "account_id": src, "to_account_id": dst}))

    def balance(self, account_id) -> str:
        return self.ok(self.c.get(f"/api/accounts/{account_id}"))["current_balance"]


@pytest.fixture
def api(client):
    return Api(client)


@pytest.fixture
def today():
    return date.today()
