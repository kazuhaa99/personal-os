import csv
import io
from datetime import timedelta

from app.services import insights
from app.services.dates import add_months, month_start

HEADER = "date,type,amount,account,to_account,category,description,payee,tags\n"


def _import(api, body: str, dry_run: bool = False):
    return api.ok(api.c.post(f"/api/transactions/import?dry_run={str(dry_run).lower()}",
                             files={"file": ("tx.csv", body.encode(), "text/csv")}))


def test_csv_import_reports_every_row(api):
    api.account("Main", opening="0")
    api.account("Savings", type="savings")
    body = HEADER + "\n".join([
        "2026-03-01,income,1000,Main,,Salary,March salary,,",
        "05.03.2026,expense,\"1 234,50\",main,,Food and groceries,Groceries,Shop,food|weekly",
        "2026-03-06,transfer,200,Main,Savings,,Move,,",
        "2026-03-07,,-45.10,Main,,Transport,Taxi,,",          # sign decides type
        "2026-03-08,expense,0,Main,,Transport,zero,,",          # rejected
        "2026-03-08,expense,-3,Main,,Transport,negative,,",     # rejected
        "2026-03-08,expense,1.005,Main,,Transport,precision,,",  # rejected
        "2026-13-01,expense,5,Main,,Transport,bad date,,",      # rejected
        "2026-03-08,expense,5,Nope,,Transport,acct,,",          # rejected
        "2026-03-08,expense,5,Main,,Salary,wrong kind,,",       # rejected
        "2026-03-08,refund,5,Main,,Transport,type,,",           # rejected
        "",
    ])
    preview = _import(api, body, dry_run=True)
    assert preview["imported"] == 4 and len(preview["rejected"]) == 7 and preview["total_rows"] == 11
    assert api.ok(api.c.get("/api/transactions"))["total"] == 0  # dry run writes nothing

    report = _import(api, body)
    assert report["imported"] == 4
    reasons = {r["row"]: r["reason"] for r in report["rejected"]}
    assert set(reasons) == {6, 7, 8, 9, 10, 11, 12}
    assert "2 decimal" in reasons[8] and "unknown account" in reasons[10]
    page = api.ok(api.c.get("/api/transactions"))
    assert page["totals"][0] == {"currency": "KZT", "income": "1000.00", "expense": "1279.60", "net": "-279.60",
                                 "transfers": "200.00"}
    tagged = [t for t in page["items"] if t["tags"]][0]
    assert tagged["tags"] == ["food", "weekly"] and tagged["payee"] == "Shop"


def test_csv_reimport_is_detected_as_duplicates(api):
    api.account("Main", opening="0")
    body = HEADER + "2026-03-01,expense,10,Main,,Transport,Bus,,\n2026-03-01,expense,10,Main,,Transport,Bus,,\n"
    first = _import(api, body)
    assert first["imported"] == 2  # two genuinely identical purchases in one file
    second = _import(api, body)
    assert second["imported"] == 0 and len(second["duplicates"]) == 2
    assert api.ok(api.c.get("/api/transactions"))["total"] == 2


def test_csv_missing_columns_rejected(api):
    r = api.c.post("/api/transactions/import", files={"file": ("x.csv", b"foo,bar\n1,2\n", "text/csv")})
    assert r.status_code == 422 and "Missing required" in r.json()["error"]["message"]


def test_csv_semicolon_delimiter(api):
    api.account("Main", opening="0")
    body = "date;type;amount;account;category\n2026-03-01;expense;12,50;Main;Transport\n"
    assert _import(api, body)["imported"] == 1


def test_csv_export_round_trips_and_neutralises_formulas(api):
    a, b = api.account("Main", opening="100"), api.account("Savings", type="savings")
    api.expense(a, "12.30", description="=HYPERLINK(\"x\")", payee="Café", tags=["a", "b"])
    api.transfer(a, b, "50")
    api.income(a, "999.99", d="2026-04-01")
    resp = api.c.get("/api/transactions/export.csv?end=2026-03-31")
    assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    assert [r["amount"] for r in rows] == ["50.00", "12.30"] or [r["amount"] for r in rows] == ["12.30", "50.00"]
    exp = next(r for r in rows if r["type"] == "expense")
    assert exp["description"].startswith("'=")  # formula neutralised
    assert exp["tags"] == "a|b" and exp["currency"] == "KZT" and exp["category"] == "Food and groceries"
    tr = next(r for r in rows if r["type"] == "transfer")
    assert tr["to_account"] == "Savings" and tr["category"] == ""

    # Re-importing the export finds only duplicates, i.e. it round-trips exactly.
    report = _import(api, resp.text)
    assert report["imported"] == 0 and len(report["duplicates"]) == 2 and report["rejected"] == []


# ------------------------------------------------------------------ insights


def test_insights_explain_and_link(api, db, today):
    acc = api.account(opening="1000", opening_date=(today - timedelta(days=5)).isoformat())
    api.ok(api.c.put("/api/budgets", json={"category_id": api.cat("Transport"),
                                           "month": today.strftime("%Y-%m"), "amount": "100"}))
    api.expense(acc, "150", d=today.isoformat(), category="Transport")
    api.ok(api.c.post("/api/tasks", json={"title": "Old", "due_date": (today - timedelta(days=1)).isoformat()}))
    api.ok(api.c.post("/api/recurring", json={
        "name": "Internet", "type": "expense", "amount": "5000", "frequency": "monthly",
        "start_date": (today + timedelta(days=2)).isoformat(), "account_id": acc,
        "category_id": api.cat("Subscriptions")}))

    items = {i["key"].split(":")[0]: i for i in insights.compute(db, today)}
    assert items["budget-over"]["severity"] == "critical" and "/finances/budgets" in items["budget-over"]["link"]
    assert "150.00" in items["budget-over"]["explanation"]
    assert items["tasks-overdue"]["link"] == "/tasks?view=overdue"
    assert items["recurring-due"]["estimate"] is True
    assert items["cash-coverage"]["estimate"] is True  # 5000 expected > 850 available
    assert "spend-up" not in items  # not enough history to compare months

    key = items["budget-over"]["key"]
    api.ok(api.c.post(f"/api/insights/{key}/dismiss"))
    assert key not in {i["key"] for i in api.ok(api.c.get("/api/insights"))}
    api.ok(api.c.post("/api/insights/restore"))
    assert key in {i["key"] for i in api.ok(api.c.get("/api/insights"))}


def test_spending_increase_needs_full_previous_month(api, db, today):
    if today.day < 7:
        return  # rule intentionally silent early in the month
    prev = add_months(month_start(today), -1)
    acc = api.account(opening="100000", opening_date=prev.isoformat())
    api.expense(acc, "1000", d=prev.isoformat(), category="Restaurants and coffee")
    api.expense(acc, "2000", d=today.isoformat(), category="Restaurants and coffee")
    keys = [i["key"] for i in insights.compute(db, today)]
    assert any(k.startswith("spend-up:") for k in keys)


# ------------------------------------------------------------------ demo data


def test_demo_data_is_labelled_and_removable_without_touching_real_data(api):
    real = api.account("My real account", opening="10", opening_date="2020-01-01")
    api.expense(real, "1", d="2026-03-01")
    api.ok(api.c.post("/api/demo"))
    assert api.c.post("/api/demo").status_code == 409
    accounts = api.ok(api.c.get("/api/accounts"))
    assert all(a["name"].startswith("Demo · ") for a in accounts if a["is_demo"])
    page = api.ok(api.c.get("/api/transactions?limit=500"))
    assert page["total"] > 50

    result = api.ok(api.c.delete("/api/demo"))
    assert result["kept_accounts"] == []
    accounts = api.ok(api.c.get("/api/accounts"))
    assert [a["name"] for a in accounts] == ["My real account"]
    assert api.ok(api.c.get("/api/transactions"))["total"] == 1
    assert api.ok(api.c.get("/api/installments")) == []
    assert api.ok(api.c.get("/api/habits")) == [] and api.ok(api.c.get("/api/goals")) == []
    assert api.balance(real) == "9.00"


def test_insights_follow_accept_language(api):
    from datetime import date, timedelta

    api.ok(api.c.post("/api/tasks", json={"title": "Old one", "due_date": str(date.today() - timedelta(days=3))}))
    def overdue(lang):
        items = api.ok(api.c.get("/api/insights", headers={"Accept-Language": lang}))
        return next(i for i in items if i["category"] == "tasks")
    assert overdue("en")["title"] == "1 overdue task"
    assert overdue("ru-RU,ru;q=0.9")["title"] == "1 просроченная задача"
    assert overdue("ko")["title"] == "기한 지난 할 일 1개"
    assert "Old one" in overdue("ru")["explanation"]
    dash = api.ok(api.c.get("/api/dashboard", headers={"Accept-Language": "ko"}))
    assert any(i["title"] == "기한 지난 할 일 1개" for i in dash["insights"])
