from decimal import Decimal


def test_balance_is_opening_plus_income_minus_expenses(api):
    acc = api.account(opening="1000.00")
    api.income(acc, "500.25")
    api.expense(acc, "200.10")
    assert api.balance(acc) == "1300.15"


def test_transfer_moves_money_between_accounts_and_is_not_income_or_expense(api):
    a, b = api.account("A", opening="1000"), api.account("B", type="savings")
    api.income(a, "100")
    api.transfer(a, b, "400")
    assert api.balance(a) == "700.00"
    assert api.balance(b) == "400.00"

    totals = api.ok(api.c.get("/api/transactions"))["totals"][0]
    assert totals["income"] == "100.00"
    assert totals["expense"] == "0.00"
    assert totals["transfers"] == "400.00"

    flow = api.ok(api.c.get("/api/analytics/summary?start=2026-03&end=2026-03"))["cash_flow"]
    assert flow["total_income"] == "100.00"
    assert flow["total_expense"] == "0.00"


def test_edit_transaction_updates_balances(api):
    a, b = api.account("A", opening="100"), api.account("B")
    tx = api.expense(a, "40")
    assert api.balance(a) == "60.00"
    api.ok(api.c.patch(f"/api/transactions/{tx['id']}", json={"amount": "10.50"}))
    assert api.balance(a) == "89.50"
    # Change into a transfer: category is dropped, both sides update.
    api.ok(api.c.patch(f"/api/transactions/{tx['id']}", json={"type": "transfer", "to_account_id": b}))
    assert api.balance(a) == "89.50"
    assert api.balance(b) == "10.50"
    # Transfer back into an expense needs a category.
    r = api.c.patch(f"/api/transactions/{tx['id']}", json={"type": "expense"})
    assert r.status_code == 422


def test_delete_transaction_restores_balance(api):
    acc = api.account(opening="100")
    tx = api.expense(acc, "30")
    api.ok(api.c.delete(f"/api/transactions/{tx['id']}"))
    assert api.balance(acc) == "100.00"
    assert api.c.get(f"/api/transactions/{tx['id']}").status_code == 404


def test_zero_negative_and_overprecise_amounts_are_rejected(api):
    acc = api.account()
    for amount in ("0", "-5", "1.005"):
        r = api.c.post("/api/transactions", json={"type": "expense", "amount": amount, "date": "2026-03-01",
                                                  "account_id": acc, "category_id": api.cat("Transport")})
        assert r.status_code == 422, amount
        assert r.json()["error"]["code"] == "validation_failed"


def test_category_kind_must_match_type(api):
    acc = api.account()
    r = api.c.post("/api/transactions", json={"type": "expense", "amount": "5", "date": "2026-03-01",
                                              "account_id": acc, "category_id": api.cat("Salary")})
    assert r.status_code == 422
    assert "income category" in r.json()["error"]["message"]


def test_transfer_validation(api):
    a, usd = api.account("A"), api.account("USD", currency="USD")
    same = api.c.post("/api/transactions", json={"type": "transfer", "amount": "5", "date": "2026-03-01",
                                                 "account_id": a, "to_account_id": a})
    assert same.status_code == 422
    cross = api.c.post("/api/transactions", json={"type": "transfer", "amount": "5", "date": "2026-03-01",
                                                  "account_id": a, "to_account_id": usd})
    assert cross.status_code == 422 and "Cross-currency" in cross.json()["error"]["message"]
    with_cat = api.c.post("/api/transactions", json={"type": "transfer", "amount": "5", "date": "2026-03-01",
                                                     "account_id": a, "to_account_id": usd,
                                                     "category_id": api.cat("Other")})
    assert with_cat.status_code == 422


def test_transaction_before_opening_date_rejected(api):
    acc = api.account(opening_date="2026-03-01")
    r = api.c.post("/api/transactions", json={"type": "expense", "amount": "5", "date": "2026-02-28",
                                              "account_id": acc, "category_id": api.cat("Other")})
    assert r.status_code == 422


def test_archived_accounts(api):
    acc = api.account(opening="50")
    blocked = api.c.patch(f"/api/accounts/{acc}", json={"is_archived": True})
    assert blocked.status_code == 409  # non-zero balance

    api.expense(acc, "50")
    api.ok(api.c.patch(f"/api/accounts/{acc}", json={"is_archived": True}))
    r = api.c.post("/api/transactions", json={"type": "expense", "amount": "1", "date": "2026-03-11",
                                              "account_id": acc, "category_id": api.cat("Other")})
    assert r.status_code == 422 and "archived" in r.json()["error"]["message"]
    # History is preserved and still listed.
    assert api.ok(api.c.get(f"/api/transactions?account_id={acc}"))["total"] == 1
    # Accounts with history cannot be deleted.
    assert api.c.delete(f"/api/accounts/{acc}").status_code == 409


def test_unused_account_can_be_deleted_and_names_are_unique(api):
    acc = api.account("Wallet")
    assert api.c.post("/api/accounts", json={"name": "wallet", "type": "cash"}).status_code == 409
    api.ok(api.c.delete(f"/api/accounts/{acc}"))


def test_totals_never_mix_currencies(api):
    kzt, usd = api.account("KZT acc"), api.account("USD acc", currency="USD")
    api.income(kzt, "1000")
    api.income(usd, "10")
    totals = {t["currency"]: t for t in api.ok(api.c.get("/api/transactions"))["totals"]}
    assert totals["KZT"]["income"] == "1000.00"
    assert totals["USD"]["income"] == "10.00"
    dash = api.ok(api.c.get("/api/dashboard"))
    assert {t["currency"]: t["amount"] for t in dash["accounts"]["totals"]} == {"KZT": "1000.00", "USD": "10.00"}


def test_date_range_filter_respects_month_boundaries(api):
    acc = api.account()
    api.expense(acc, "1", d="2026-02-28")
    api.expense(acc, "2", d="2026-03-01")
    api.expense(acc, "3", d="2026-03-31")
    api.expense(acc, "4", d="2026-04-01")
    page = api.ok(api.c.get("/api/transactions?start=2026-03-01&end=2026-03-31"))
    assert sorted(t["amount"] for t in page["items"]) == ["2.00", "3.00"]
    assert page["totals"][0]["expense"] == "5.00"
    flow = api.ok(api.c.get("/api/analytics/summary?start=2026-02&end=2026-04"))["cash_flow"]["months"]
    assert [m["expense"] for m in flow] == ["1.00", "5.00", "4.00"]


def test_filters_and_search(api):
    a, b = api.account("A"), api.account("B")
    api.expense(a, "10", description="Coffee beans", payee="Roastery", tags=["Treat"])
    api.expense(b, "20", category="Transport", description="Taxi")
    api.income(a, "30")
    get = lambda qs: api.ok(api.c.get(f"/api/transactions?{qs}"))["total"]  # noqa: E731
    assert get("q=coffee") == 1
    assert get("q=roast") == 1
    assert get("tag=treat") == 1
    assert get(f"account_id={b}") == 1
    assert get("type=income") == 1
    assert get(f"category_id={api.cat('Transport')}") == 1
    assert get("min_amount=15&max_amount=25") == 1


def test_empty_dataset_responses(api):
    page = api.ok(api.c.get("/api/transactions"))
    assert page == {"items": [], "total": 0, "limit": 50, "offset": 0, "totals": []}
    summary = api.ok(api.c.get("/api/analytics/summary"))
    assert summary["cash_flow"]["months_with_data"] == 0
    assert summary["cash_flow"]["average_monthly_expense"] is None
    assert summary["categories"]["categories"] == []
    dash = api.ok(api.c.get("/api/dashboard"))
    assert dash["accounts"]["totals"] == [] and dash["insights"] == []


def test_many_small_amounts_sum_exactly(api):
    acc = api.account()
    for _ in range(10):
        api.expense(acc, "0.10")
    assert api.balance(acc) == "-1.00"
    assert Decimal(api.ok(api.c.get("/api/transactions"))["totals"][0]["expense"]) == Decimal("1.00")
