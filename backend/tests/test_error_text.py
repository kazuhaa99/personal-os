"""Error messages reach the person in their language (Accept-Language: ru / ko)."""

import re

import pytest

from app.config import get_settings
from app.error_messages import raised_messages
from app.services.error_text import MESSAGES, translate

PLACEHOLDER = re.compile(r"\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}")


def test_every_raised_message_is_translated():
    missing = {msg: where for msg, where in raised_messages().items() if msg not in MESSAGES}
    assert not missing, "add these to app/services/error_text.py:\n" + "\n".join(f"{w}: {m}" for m, w in missing.items())


@pytest.mark.parametrize("template", sorted(MESSAGES))
def test_translations_keep_placeholders(template):
    ru, ko = MESSAGES[template]
    want = sorted(PLACEHOLDER.findall(template))
    assert ru and ko
    assert sorted(PLACEHOLDER.findall(ru)) == want, ru
    assert sorted(PLACEHOLDER.findall(ko)) == want, ko


def test_translate_fills_placeholders_and_enum_words():
    assert translate("Account 5 not found", "ru") == "Счёт 5 не найден"
    assert translate("Destination account 7 does not exist", "ru") == "Счёт зачисления 7 не существует"
    assert translate("An income category named 'Bonus' already exists", "ko") == "‘Bonus’ 이름의 수입 카테고리가 이미 있어요"
    assert translate("Goal 3 not found", "ru") == "Цель 3 не найдена"  # specific template wins over the generic one
    assert translate("Something new", "ru") == "Something new"
    assert translate("Account 5 not found", "en") == "Account 5 not found"


def ru(c):
    c.headers["Accept-Language"] = "ru-RU,ru;q=0.9"
    return c


def test_validation_errors_are_localised(client):
    body = {"type": "bank", "currency": "KZT", "opening_balance": "abc", "opening_date": "2026-01-01"}
    r = ru(client).post("/api/accounts", json=body)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["message"] == "Название: Обязательное поле"
    fields = {d["field"]: d["message"] for d in err["details"]}
    assert fields["name"] == "Обязательное поле"
    assert "число" in fields["opening_balance"]

    client.headers["Accept-Language"] = "ko"
    assert client.post("/api/accounts", json=body).json()["error"]["message"] == "이름: 필수 항목이에요"

    client.headers["Accept-Language"] = "en"
    assert "required" in client.post("/api/accounts", json=body).json()["error"]["message"].lower()


def test_custom_validator_message_is_localised(client):
    acc = client.post("/api/accounts", json={"name": "A", "type": "bank", "currency": "KZT", "opening_balance": "0", "opening_date": "2026-01-01"}).json()["id"]
    r = ru(client).post("/api/transactions", json={"type": "transfer", "amount": "1", "date": "2026-03-01", "account_id": acc, "to_account_id": acc})
    assert r.status_code == 422
    assert "два разных счёта" in r.json()["error"]["message"]


def test_domain_errors_are_localised(client):
    r = ru(client).get("/api/transactions/987654")
    assert r.status_code == 404
    assert r.json()["error"]["message"] == "Операция 987654 не найдена"


def test_http_errors_are_localised(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_enabled", True)
    r = ru(client).get("/api/accounts")
    assert r.status_code == 401 and r.json()["detail"] == "Нужно войти в аккаунт"


def test_csv_import_reasons_are_localised(client):
    csv = "date,type,amount,account\n2026-03-01,expense,5,Nope\n"
    r = ru(client).post("/api/transactions/import?dry_run=true", files={"file": ("t.csv", csv, "text/csv")})
    assert r.status_code == 200, r.text
    assert r.json()["rejected"][0]["reason"] == "неизвестный счёт «Nope»"
