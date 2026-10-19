"""Server-side text localisation for generated content (insights).

The UI sends Accept-Language; `use_language` stores the chosen language in a
context variable for the duration of the request. Everything else (validation
and error messages) stays English and is translated by the client where known.
"""

from contextvars import ContextVar
from datetime import date

from fastapi import Header

LANGS = ("en", "ru", "ko")
_lang: ContextVar[str] = ContextVar("lang", default="en")


def pick_language(header: str | None) -> str:
    for part in (header or "").split(","):
        code = part.split(";")[0].strip().lower()[:2]
        if code in LANGS:
            return code
    return "en"


async def use_language(accept_language: str | None = Header(default=None)) -> str:
    lang = pick_language(accept_language)
    _lang.set(lang)
    return lang


def current() -> str:
    return _lang.get()


def set_language(lang: str) -> None:
    _lang.set(lang if lang in LANGS else "en")


_RU_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
_RU_MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]


def fmt_day(d: date) -> str:
    """Short day label: 'Mar 5' / '5 марта' / '3월 5일'."""
    lang = current()
    if lang == "ru":
        return f"{d.day} {_RU_MONTHS[d.month - 1]}"
    if lang == "ko":
        return f"{d.month}월 {d.day}일"
    return f"{d:%b} {d.day}"


def fmt_month(d: date) -> str:
    lang = current()
    if lang == "ru":
        return f"{_RU_MONTHS_NOM[d.month - 1]} {d.year}"
    if lang == "ko":
        return f"{d.year}년 {d.month}월"
    return f"{d:%B %Y}"


def plural(n: int, one: str, few: str, many: str) -> str:
    """Russian plural form for n."""
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


# Default category names, translated for display in generated text.
CATEGORY_NAMES = {
    "ru": {
        "Salary": "Зарплата", "Freelance income": "Фриланс", "Other income": "Прочий доход",
        "Food and groceries": "Продукты", "Restaurants and coffee": "Рестораны и кофе", "Transport": "Транспорт",
        "Housing and utilities": "Жильё и коммуналка", "Shopping": "Покупки", "Entertainment": "Развлечения",
        "Education": "Образование", "Health and fitness": "Здоровье и спорт", "Subscriptions": "Подписки",
        "Debt and installment payments": "Долги и рассрочки", "Savings": "Накопления", "Other": "Другое",
    },
    "ko": {
        "Salary": "급여", "Freelance income": "프리랜스 수입", "Other income": "기타 수입",
        "Food and groceries": "식료품", "Restaurants and coffee": "외식 및 카페", "Transport": "교통",
        "Housing and utilities": "주거 및 공과금", "Shopping": "쇼핑", "Entertainment": "여가",
        "Education": "교육", "Health and fitness": "건강 및 운동", "Subscriptions": "구독",
        "Debt and installment payments": "부채 및 할부 상환", "Savings": "저축", "Other": "기타",
    },
}


def category_name(name: str) -> str:
    return CATEGORY_NAMES.get(current(), {}).get(name, name)
