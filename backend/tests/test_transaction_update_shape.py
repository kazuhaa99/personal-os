"""Editing a transaction says what's wrong instead of silently dropping parts of the request."""

import pytest


@pytest.mark.parametrize("field", ["type", "amount", "date", "account_id", "description", "tags"])
def test_null_for_a_required_field_is_refused(api, field):
    acc = api.account(opening="1000")
    tx = api.expense(acc, "50")
    r = api.c.patch(f"/api/transactions/{tx['id']}", json={field: None})
    assert r.status_code == 422, r.text
    assert r.json()["error"]["details"][0]["field"] == field


def test_a_destination_account_on_an_expense_is_refused(api):
    acc = api.account(name="Main", opening="1000")
    other = api.account(name="Other")
    tx = api.expense(acc, "50")
    r = api.c.patch(f"/api/transactions/{tx['id']}", json={"to_account_id": other})
    assert r.status_code == 422, r.text
    assert api.ok(api.c.get(f"/api/transactions/{tx['id']}"))["to_account"] is None


def test_clearing_optional_fields_still_works(api):
    acc = api.account(opening="1000")
    tx = api.expense(acc, "50", payee="Shop")
    updated = api.ok(api.c.patch(f"/api/transactions/{tx['id']}", json={"payee": None}))
    assert updated["payee"] is None
