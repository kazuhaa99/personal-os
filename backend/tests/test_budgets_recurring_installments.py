from datetime import date, timedelta

from app.services import recurring as rec_svc
from app.services.dates import add_months, month_start


# ------------------------------------------------------------------ budgets


def test_budget_utilization_uses_actual_expenses_only(api):
    acc, sav = api.account(opening="100000"), api.account("Savings", type="savings")
    api.ok(api.c.put("/api/budgets", json={"category_id": api.cat("Food and groceries"), "month": "2026-03",
                                           "amount": "1000"}))
    api.expense(acc, "300", d="2026-03-02")
    api.expense(acc, "560", d="2026-03-31")
    api.expense(acc, "999", d="2026-04-01")  # next month
    api.expense(acc, "50", d="2026-03-15", category="Transport")  # unbudgeted category
    api.transfer(acc, sav, "5000", d="2026-03-10")  # never a budget expense

    month = api.ok(api.c.get("/api/budgets?month=2026-03"))
    line = month["lines"][0]
    assert (line["spent"], line["remaining"], line["utilization"], line["status"]) == ("860.00", "140.00", "86.0",
                                                                                       "warning")
    assert month["unbudgeted_spent"] == "50.00"


def test_budget_over_limit_and_previous_month(api):
    acc = api.account(opening="100000")
    api.ok(api.c.put("/api/budgets", json={"category_id": api.cat("Transport"), "month": "2026-02",
                                           "amount": "100"}))
    api.expense(acc, "70", d="2026-02-10", category="Transport")
    api.expense(acc, "120", d="2026-03-10", category="Transport")
    line = api.ok(api.c.get("/api/budgets?month=2026-03"))["lines"][0]
    assert line["status"] == "over" and line["remaining"] == "-20.00"
    assert line["previous_month_spent"] == "70.00"
    assert line["average_3m_spent"] is None  # history doesn't cover 3 full months


def test_budget_changes_do_not_rewrite_history_and_can_be_disabled(api):
    cid = api.cat("Shopping")
    api.ok(api.c.put("/api/budgets", json={"category_id": cid, "month": "2026-01", "amount": "500"}))
    api.ok(api.c.put("/api/budgets", json={"category_id": cid, "month": "2026-03", "amount": "800"}))
    api.ok(api.c.put("/api/budgets", json={"category_id": cid, "month": "2026-05", "amount": "0",
                                           "is_active": False}))
    limit = lambda m: [line["limit"] for line in api.ok(api.c.get(f"/api/budgets?month={m}"))["lines"]]  # noqa: E731
    assert limit("2026-02") == ["500.00"]
    assert limit("2026-04") == ["800.00"]
    assert limit("2026-06") == []


def test_budget_rejects_income_category(api):
    r = api.c.put("/api/budgets", json={"category_id": api.cat("Salary"), "month": "2026-03", "amount": "1"})
    assert r.status_code == 422


# ------------------------------------------------------------------ recurring


def _rule(api, acc, start="2026-01-31", **kw):
    return api.ok(api.c.post("/api/recurring", json={
        "name": "Rent", "type": "expense", "amount": "1000", "frequency": "monthly", "start_date": start,
        "account_id": acc, "category_id": api.cat("Housing and utilities"), **kw}))


def test_rule_creation_does_not_move_money(api):
    acc = api.account(opening="5000")
    _rule(api, acc)
    assert api.balance(acc) == "5000.00"
    assert api.ok(api.c.get("/api/transactions"))["total"] == 0


def test_confirming_creates_one_transaction_and_advances_schedule(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc)
    tx = api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-01-31"}))
    assert tx["recurring_rule_id"] == rule["id"] and tx["amount"] == "1000.00"
    assert api.balance(acc) == "4000.00"
    rules = api.ok(api.c.get("/api/recurring"))
    assert rules[0]["next_due_date"] == "2026-02-28"  # month-end clamp
    assert rules[0]["confirmed_count"] == 1


def test_repeated_confirmation_is_rejected(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc)
    api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-01-31"}))
    again = api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-01-31"})
    assert again.status_code == 409
    assert api.ok(api.c.get("/api/transactions"))["total"] == 1
    wrong_day = api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-02-15"})
    assert wrong_day.status_code == 422


def test_pending_occurrences_are_expected_not_actual(db, api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc, start="2026-01-10")
    model = rec_svc.get_rule(db, rule["id"])
    pending = rec_svc.pending_occurrences(db, model, date(2026, 4, 30))
    assert pending == [date(2026, 1, 10), date(2026, 2, 10), date(2026, 3, 10), date(2026, 4, 10)]
    # processing the same schedule twice yields the same expectations and no transactions
    assert rec_svc.pending_occurrences(db, model, date(2026, 4, 30)) == pending
    assert api.ok(api.c.get("/api/transactions"))["total"] == 0
    # out-of-order confirmation of a later occurrence does not duplicate or hide others
    api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-03-10"}))
    db.expire_all()
    assert rec_svc.pending_occurrences(db, rec_svc.get_rule(db, rule["id"]), date(2026, 4, 30)) == [
        date(2026, 1, 10), date(2026, 2, 10), date(2026, 4, 10)]


def test_skip_and_delete_reopens_occurrence(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc, start="2026-01-10")
    skipped = api.ok(api.c.post(f"/api/recurring/{rule['id']}/skip", json={"occurrence_date": "2026-01-10"}))
    assert skipped["next_due_date"] == "2026-02-10"
    tx = api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-02-10",
                                                                          "amount": "1100"}))
    assert api.balance(acc) == "3900.00"
    api.ok(api.c.delete(f"/api/transactions/{tx['id']}"))
    assert api.ok(api.c.get("/api/recurring"))[0]["next_due_date"] == "2026-02-10"


def test_paused_and_ended_rules_have_no_expectations(api, today):
    acc = api.account(opening="0", opening_date=(today - timedelta(days=60)).isoformat())
    rule = _rule(api, acc, start=today.isoformat())
    assert len(api.ok(api.c.get("/api/recurring/expected?days=10"))) == 1
    api.ok(api.c.patch(f"/api/recurring/{rule['id']}", json={"is_active": False}))
    assert api.ok(api.c.get("/api/recurring/expected?days=10")) == []


def test_deleting_rule_keeps_transactions(api):
    acc = api.account(opening="5000")
    rule = _rule(api, acc)
    api.ok(api.c.post(f"/api/recurring/{rule['id']}/confirm", json={"occurrence_date": "2026-01-31"}))
    api.ok(api.c.delete(f"/api/recurring/{rule['id']}"))
    page = api.ok(api.c.get("/api/transactions"))
    assert page["total"] == 1 and page["items"][0]["recurring_rule_id"] is None


# ------------------------------------------------------------------ installments


def _plan(api, acc=None, **kw):
    body = {"name": "Phone", "original_amount": "120000", "payment_amount": "10000", "frequency": "monthly",
            "next_payment_date": "2026-03-15", **kw}
    if acc:
        body["default_account_id"] = acc
    return api.ok(api.c.post("/api/installments", json=body))


def test_creating_plan_does_not_touch_balances(api):
    acc = api.account(opening="50000")
    plan = _plan(api, acc)
    assert api.balance(acc) == "50000.00"
    assert plan["outstanding"] == "120000.00" and plan["remaining_payments_estimate"] == 12
    assert plan["estimated_payoff_date"] == "2027-02-15"


def test_payment_reduces_liability_and_records_single_expense(api):
    acc = api.account(opening="50000")
    plan = _plan(api, acc)
    plan = api.ok(api.c.post(f"/api/installments/{plan['id']}/payments", json={"date": "2026-03-15",
                                                                               "amount": "10000"}))
    assert plan["outstanding"] == "110000.00" and plan["paid_amount"] == "10000.00"
    assert plan["next_payment_date"] == "2026-04-15"
    assert api.balance(acc) == "40000.00"
    flow = api.ok(api.c.get("/api/analytics/summary?start=2026-03&end=2026-03"))
    assert flow["cash_flow"]["total_expense"] == "10000.00"  # counted exactly once
    assert flow["liabilities"] == [{"currency": "KZT", "amount": "110000.00"}]
    tx = api.ok(api.c.get("/api/transactions"))["items"][0]
    assert tx["category"]["name"] == "Debt and installment payments" and tx["installment_payment_id"]


def test_payment_without_transaction_only_reduces_liability(api):
    acc = api.account(opening="50000")
    plan = _plan(api, acc, outstanding_amount="30000")
    plan = api.ok(api.c.post(f"/api/installments/{plan['id']}/payments", json={
        "date": "2026-03-15", "amount": "10000", "record_transaction": False}))
    assert plan["outstanding"] == "20000.00"
    assert api.balance(acc) == "50000.00"
    assert api.ok(api.c.get("/api/transactions"))["total"] == 0


def test_overpayment_rejected_and_payoff(api):
    acc = api.account(opening="50000")
    plan = _plan(api, acc, outstanding_amount="15000")
    over = api.c.post(f"/api/installments/{plan['id']}/payments", json={"date": "2026-03-15", "amount": "15000.01"})
    assert over.status_code == 422
    api.ok(api.c.post(f"/api/installments/{plan['id']}/payments", json={"date": "2026-03-15", "amount": "10000"}))
    plan = api.ok(api.c.post(f"/api/installments/{plan['id']}/payments", json={"date": "2026-04-15",
                                                                               "amount": "5000"}))
    assert plan["status"] == "paid_off" and plan["outstanding"] == "0.00" and plan["next_payment_date"] is None
    more = api.c.post(f"/api/installments/{plan['id']}/payments", json={"date": "2026-05-15", "amount": "1"})
    assert more.status_code == 422


def test_linked_transaction_is_protected_and_payment_delete_removes_both(api):
    acc = api.account(opening="50000")
    plan = _plan(api, acc)
    plan = api.ok(api.c.post(f"/api/installments/{plan['id']}/payments", json={"date": "2026-03-15",
                                                                               "amount": "10000"}))
    tx = api.ok(api.c.get("/api/transactions"))["items"][0]
    assert api.c.delete(f"/api/transactions/{tx['id']}").status_code == 409
    assert api.c.patch(f"/api/transactions/{tx['id']}", json={"amount": "1"}).status_code == 409
    api.ok(api.c.patch(f"/api/transactions/{tx['id']}", json={"description": "Phone, March"}))
    assert api.c.delete(f"/api/installments/{plan['id']}").status_code == 409

    plan = api.ok(api.c.delete(f"/api/installments/{plan['id']}/payments/{plan['payments'][0]['id']}"))
    assert plan["outstanding"] == "120000.00"
    assert api.balance(acc) == "50000.00"
    api.ok(api.c.delete(f"/api/installments/{plan['id']}"))


def test_payment_account_currency_must_match(api):
    usd = api.account("USD", currency="USD", opening="100")
    plan = _plan(api)
    r = api.c.post(f"/api/installments/{plan['id']}/payments", json={"date": "2026-03-15", "amount": "10",
                                                                    "account_id": usd})
    assert r.status_code == 422


def test_upcoming_installments_are_projected(api, today):
    plan = _plan(api, next_payment_date=today.isoformat(), outstanding_amount="25000")
    items = [i for i in api.ok(api.c.get("/api/recurring/expected?days=70")) if i["kind"] == "installment"]
    assert [i["amount"] for i in items] == ["10000.00", "10000.00", "5000.00"]
    assert items[0]["source_id"] == plan["id"]
    assert month_start(today) <= date.fromisoformat(items[0]["due_date"]) <= add_months(today, 1)
