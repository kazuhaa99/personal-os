"""Changing when a recurring payment ends moves its schedule with it: extending (or clearing)
the end date of a finished rule brings its expected payments back."""

from tests.test_budgets_recurring_installments import _rule


def _confirm(api, rule, day):
    api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": day}))


def _next_due(api, rule):
    return next(r for r in api.ok(api.c.get("/api/recurring")) if r["id"] == rule["id"])["next_due_date"]


def test_extending_a_finished_rule_resumes_after_the_old_end(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc, start="2026-01-10", end_date="2026-02-28")
    _confirm(api, rule, "2026-01-10")
    _confirm(api, rule, "2026-02-10")
    assert _next_due(api, rule) is None  # finished

    api.ok(api.c.patch(f"/api/recurring/{rule['id']}", json={"end_date": "2026-06-30"}))
    assert _next_due(api, rule) == "2026-03-10"


def test_clearing_the_end_date_resumes_too(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc, start="2026-01-10", end_date="2026-01-31")
    _confirm(api, rule, "2026-01-10")
    api.ok(api.c.patch(f"/api/recurring/{rule['id']}", json={"end_date": None}))
    assert _next_due(api, rule) == "2026-02-10"


def test_shortening_then_extending_does_not_skip_a_payment(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc, start="2026-01-10")
    _confirm(api, rule, "2026-01-10")
    api.ok(api.c.patch(f"/api/recurring/{rule['id']}", json={"end_date": "2026-01-31"}))
    assert _next_due(api, rule) is None
    api.ok(api.c.patch(f"/api/recurring/{rule['id']}", json={"end_date": "2026-12-31"}))
    assert _next_due(api, rule) == "2026-02-10"


def test_an_extension_that_adds_no_payment_keeps_the_rule_finished(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc, start="2026-01-10", end_date="2026-01-31")
    _confirm(api, rule, "2026-01-10")
    api.ok(api.c.patch(f"/api/recurring/{rule['id']}", json={"end_date": "2026-02-05"}))
    assert _next_due(api, rule) is None
