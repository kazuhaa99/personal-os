from decimal import Decimal

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def test_profile_starts_blank_and_updates(api):
    p = api.ok(api.c.get("/api/profile"))
    assert p["first_name"] == "" and p["avatar_url"] is None and p["monthly"] == []
    p = api.ok(api.c.patch("/api/profile", json={"first_name": "Aru", "last_name": "Sat",
                                                  "birthday": "1999-05-01", "salary_amount": "500000", "payday": 10}))
    assert p["first_name"] == "Aru" and p["account"]["username"] == "admin"
    assert p["monthly"][0] == {"currency": "KZT", "expected": "500000.00", "salary": "500000.00", "extra": "0.00",
                               "received_this_month": "0.00"}
    # The greeting name follows the profile.
    assert api.ok(api.c.get("/api/settings"))["owner_name"] == "Aru"


def test_profile_validation(api):
    for body in ({"email": "a@b.co"}, {"payday": 32}, {"salary_amount": "-1"}, {"birthday": "2999-01-01"},
                 {"phone": "call me"}, {"unknown": 1}):
        assert api.c.patch("/api/profile", json=body).status_code == 422, body


def test_extra_income_is_normalised_monthly(api):
    api.ok(api.c.patch("/api/profile", json={"salary_amount": "300000"}))
    weekly = api.ok(api.c.post("/api/profile/incomes", json={"name": "Tutoring", "amount": "12000", "frequency": "weekly"}))
    assert weekly["monthly_amount"] == "52000.00"
    yearly = api.ok(api.c.post("/api/profile/incomes", json={"name": "Dividends", "amount": "120", "currency": "USD", "frequency": "yearly"}))
    p = api.ok(api.c.get("/api/profile"))
    assert [m["currency"] for m in p["monthly"]] == ["KZT", "USD"]
    assert p["monthly"][0]["expected"] == "352000.00" and p["monthly"][1]["expected"] == "10.00"
    api.ok(api.c.patch(f"/api/profile/incomes/{yearly['id']}", json={"is_active": False}))
    assert [m["currency"] for m in api.ok(api.c.get("/api/profile"))["monthly"]] == ["KZT"]
    api.ok(api.c.delete(f"/api/profile/incomes/{weekly['id']}"))
    assert len(api.ok(api.c.get("/api/profile"))["income_sources"]) == 1


def test_received_this_month_counts_income_transactions(api):
    acc_id = api.account()
    api.ok(api.c.patch("/api/profile", json={"salary_amount": "1000"}))
    cat = next(c["id"] for c in api.ok(api.c.get("/api/categories")) if c["name"] == "Salary")
    from datetime import date
    api.ok(api.c.post("/api/transactions", json={"type": "income", "amount": "400", "account_id": acc_id,
                                                 "category_id": cat, "date": str(date.today())}))
    assert api.ok(api.c.get("/api/profile"))["monthly"][0]["received_this_month"] == "400.00"


def test_avatar_upload_and_type_check(api):
    bad = api.c.put("/api/profile/avatar", files={"file": ("x.png", b"<svg onload=alert(1)>", "image/png")})
    assert bad.status_code == 422
    p = api.ok(api.c.put("/api/profile/avatar", files={"file": ("me.png", PNG, "image/png")}))
    assert p["avatar_url"].startswith("/api/profile/avatar?v=")
    r = api.c.get(p["avatar_url"])
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content == PNG
    too_big = api.c.put("/api/profile/avatar", files={"file": ("big.png", PNG + b"0" * (2 * 1024 * 1024), "image/png")})
    assert too_big.status_code == 422
    assert api.ok(api.c.delete("/api/profile/avatar"))["avatar_url"] is None
    assert api.c.get("/api/profile/avatar").status_code == 404


def test_monthly_helper():
    from app.services.profile import monthly
    assert monthly(Decimal("2600"), "biweekly") == Decimal("5633.33")
    assert monthly(Decimal("900"), "quarterly") == Decimal("300.00")
