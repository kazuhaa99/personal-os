from datetime import date
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ValidationFailed
from app.schemas.planning import SettingsOut, SettingsUpdate
from app.services import analytics, dashboard, demo, insights
from app.services.i18n import use_language
from app.services.dates import month_end, month_start, parse_month, today_for
from app.services.settings import get_app_settings, update_app_settings

router = APIRouter()


def money_json(data: Any) -> JSONResponse:
    """Serialize Decimal as strings (as the typed endpoints do), never as float."""
    return JSONResponse(jsonable_encoder(data, custom_encoder={Decimal: lambda d: f"{d:f}"}))


@router.get("/dashboard", tags=["overview"], dependencies=[Depends(use_language)])
def get_dashboard(db: Session = Depends(get_db)):
    return money_json(dashboard.build(db))


@router.get("/insights", tags=["overview"], dependencies=[Depends(use_language)])
def get_insights(include_dismissed: bool = False, db: Session = Depends(get_db)):
    return money_json(insights.compute(db, include_dismissed=include_dismissed))


@router.post("/insights/{key:path}/dismiss", status_code=204, tags=["overview"])
def dismiss_insight(key: str, db: Session = Depends(get_db)):
    insights.dismiss(db, key[:160])


@router.post("/insights/restore", tags=["overview"])
def restore_insights(db: Session = Depends(get_db)):
    return {"restored": insights.restore_all(db)}


def _range(db: Session, start: str | None, end: str | None) -> tuple[date, date]:
    today = today_for(db)
    try:
        s = parse_month(start) if start else analytics.default_range(today)[0]
        e = parse_month(end) if end else month_start(today)
    except ValueError as exc:
        raise ValidationFailed(str(exc)) from exc
    if e < s:
        raise ValidationFailed("'end' must not be before 'start'")
    if (e.year - s.year) * 12 + e.month - s.month > 60:
        raise ValidationFailed("Range is limited to 60 months")
    return s, e


MONTH_PATTERN = r"^\d{4}-\d{2}$"


@router.get("/analytics/summary", tags=["analytics"])
def analytics_summary(start: str | None = Query(default=None, pattern=MONTH_PATTERN),
                      end: str | None = Query(default=None, pattern=MONTH_PATTERN),
                      currency: str | None = Query(default=None, pattern=r"^[A-Z]{3}$"),
                      db: Session = Depends(get_db)):
    s, e = _range(db, start, end)
    cur = currency or get_app_settings(db).primary_currency
    today = today_for(db)
    return money_json({
        "range": {"start": s.strftime("%Y-%m"), "end": e.strftime("%Y-%m")},
        "currency": cur,
        "cash_flow": analytics.cash_flow(db, s, e, cur),
        "categories": analytics.category_breakdown(db, s, month_end(e), cur),
        "income_categories": analytics.category_breakdown(db, s, month_end(e), cur, kind="income"),
        "trend": analytics.expense_trend(db, s, e, cur),
        "balances": analytics.balance_history(db, s, e, cur, today),
        "budget_performance": analytics.budget_performance(db, s, e, cur),
        "liabilities": analytics.liabilities(db),
    })


@router.get("/settings", response_model=SettingsOut, tags=["settings"])
def read_settings(db: Session = Depends(get_db)):
    return get_app_settings(db)


@router.patch("/settings", response_model=SettingsOut, tags=["settings"])
def write_settings(data: SettingsUpdate, db: Session = Depends(get_db)):
    return update_app_settings(db, data.model_dump(exclude_unset=True))


@router.get("/demo", tags=["settings"])
def demo_status(db: Session = Depends(get_db)):
    return {"loaded": demo.has_demo(db)}


@router.post("/demo", tags=["settings"])
def load_demo(db: Session = Depends(get_db)):
    return demo.seed_demo(db)


@router.delete("/demo", tags=["settings"])
def delete_demo(db: Session = Depends(get_db)):
    return demo.remove_demo(db)


@router.get("/health", tags=["system"])
def health(kind: Literal["basic"] = "basic"):
    return {"status": "ok"}
