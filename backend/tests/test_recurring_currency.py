"""A recurring payment's amount is in its account's currency. Moving it to an account in another
currency must come with an amount in that currency, never reuse the number unconverted."""

from tests.test_budgets_recurring_installments import _rule


def test_confirming_into_another_currency_needs_the_amount_in_it(api):
    kzt = api.account(name="Tenge", opening="900000")
    usd = api.account(name="Dollars", opening="5000", currency="USD")
    rule = _rule(api, kzt, start="2026-01-10")
    r = api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-01-10", "account_id": usd})
    assert r.status_code == 422, r.text
    assert api.balance(usd) == "5000.00"

    tx = api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm",
                           json={"occurrence_date": "2026-01-10", "account_id": usd, "amount": "2"}))
    assert tx["amount"] == "2.00" and api.balance(usd) == "4998.00"


def test_confirming_into_an_account_in_the_same_currency_keeps_the_amount(api):
    main = api.account(name="Main", opening="5000")
    other = api.account(name="Other", opening="5000")
    rule = _rule(api, main, start="2026-01-10")
    api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-01-10", "account_id": other}))
    assert api.balance(other) == "4000.00"


def test_moving_a_rule_to_another_currency_needs_a_new_amount(api):
    kzt = api.account(name="Tenge")
    usd = api.account(name="Dollars", currency="USD")
    rule = _rule(api, kzt)
    assert api.c.patch(f"/api/recurring/{rule['id']}", json={"account_id": usd}).status_code == 422
    moved = api.ok(api.c.patch(f"/api/recurring/{rule['id']}", json={"account_id": usd, "amount": "3"}))
    assert moved["currency"] == "USD" and moved["amount"] == "3.00"
