"""A month in a URL or body that isn't a real month is a 422 with a clear message, never a 500."""

import pytest


@pytest.mark.parametrize("month", ["2026-13", "2026-00", "0000-01"])
def test_budgets_reject_a_month_that_does_not_exist(client, month):
    r = client.get("/api/budgets", params={"month": month})
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("month", ["2026-13", "0000-01"])
def test_setting_a_budget_rejects_a_month_that_does_not_exist(api, month):
    cat = api.c.get("/api/categories").json()[0]["id"]
    r = api.c.put("/api/budgets", json={"month": month, "category_id": cat, "amount": "100"})
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("params", [{"start": "2026-13"}, {"end": "0000-01"}])
def test_analytics_reject_a_month_that_does_not_exist(client, params):
    assert client.get("/api/analytics/summary", params=params).status_code == 422


def test_a_real_month_still_works(client):
    assert client.get("/api/budgets", params={"month": "2026-12"}).status_code == 200
