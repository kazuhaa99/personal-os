"""Deterministic insight rules.

Each rule inspects persisted data and emits zero or more insights that explain *why*
they appeared and link to the relevant screen. Rules that compare periods only fire
when there is enough history to make the comparison meaningful. Insights are
computed on demand; only dismissals are stored.

This module is the extension point for future AI-assisted analysis: such analysis
should consume the same structured data and produce the same Insight shape.
"""

from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, Goal, InsightDismissal, Task
from app.services import accounts as acc_svc
from app.services import installments as inst
from app.services import recurring
from app.services.budgets import budget_month, first_transaction_date, spending_by_category
from app.services.dates import add_months, month_start, today_for
from app.services.goals import compute_progress
from app.services.i18n import category_name, current, fmt_day, fmt_month, plural
from app.services.money import ZERO, percent, q
from app.services.settings import get_app_settings
from app.tenancy import current_user_id

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}

# Thresholds (documented so the user can reason about why something fired)
UPCOMING_DAYS = 7
GOAL_STALE_DAYS = 21
SPEND_INCREASE_PCT = Decimal("30")
SPEND_INCREASE_MIN_SHARE = Decimal("5")  # % of last month's total spend; ignores tiny categories


@dataclass
class Insight:
    key: str
    severity: str  # critical | warning | info
    category: str  # finance | tasks | goals
    title: str
    explanation: str
    link: str | None = None
    estimate: bool = False  # True when based on expected (not actual) figures


# Text templates per language. Rules pick a template by id and fill it with
# already-formatted values, so the logic stays language independent.
TEXT: dict[str, dict[str, str]] = {
    "en": {
        "budget_over_t": "{cat} is over budget",
        "budget_over_e": "Spent {spent} of a {limit} monthly limit ({over} over) in {month}.",
        "budget_warn_t": "{cat} budget is {pct}% used",
        "budget_warn_e": "{left} left of {limit} with {days} day(s) remaining in the month.",
        "kind_installment": "Installment", "kind_recurring": "Recurring payment",
        "pay_overdue_t": "{name} was due {day}",
        "pay_overdue_e": "{kind} of {amount} expected on {day} has not been recorded yet. Confirm it once paid, or skip it if it did not happen.",
        "when_today": "today", "when_tomorrow": "tomorrow", "when_days": "in {days} days",
        "pay_due_t": "{name} due {when}",
        "pay_due_e": "Expected {kind_lower} of {amount} on {day}.",
        "cash_t": "Upcoming payments exceed available {cur}",
        "cash_e": "{amount} of recurring and installment payments are expected in the next {window} days, while active {cur} accounts hold {available}. This is a projection: expected income is not included.",
        "spend_t": "{cat} spending is up {pct}%",
        "spend_e": "{now} from {start}–{end} vs {base} over the same days last month.",
        "tasks_t": "{n} overdue task{s}",
        "tasks_e": "Oldest: “{title}”, due {day}. Reschedule, complete, or delete what no longer matters.",
        "goal_overdue_t": "“{title}” passed its target date",
        "goal_overdue_e": "Target was {day}; progress is {pct}%. Set a new date or mark it completed/paused.",
        "goal_stale_t": "No progress on “{title}” in {days} days",
        "goal_stale_e": "Last change was on {day}. A small next step or a task linked to this goal can restart momentum.",
    },
    "ru": {
        "budget_over_t": "{cat}: бюджет превышен",
        "budget_over_e": "Потрачено {spent} при лимите {limit} в месяц (на {over} больше) — {month}.",
        "budget_warn_t": "{cat}: бюджет использован на {pct}%",
        "budget_warn_e": "Осталось {left} из {limit}, до конца месяца {days_word}.",
        "kind_installment": "Платёж по рассрочке", "kind_recurring": "Регулярный платёж",
        "pay_overdue_t": "{name}: срок был {day}",
        "pay_overdue_e": "{kind} на {amount}, ожидавшийся {day}, ещё не записан. Подтвердите его после оплаты или пропустите, если его не было.",
        "when_today": "сегодня", "when_tomorrow": "завтра", "when_days": "через {days_word}",
        "pay_due_t": "{name} — {when}",
        "pay_due_e": "{kind} на {amount} ожидается {day}.",
        "cash_t": "Предстоящие платежи больше доступных {cur}",
        "cash_e": "В ближайшие {window} дней ожидается {amount} регулярных платежей и рассрочек, а на активных счетах в {cur} — {available}. Это прогноз: ожидаемый доход не учтён.",
        "spend_t": "{cat}: расходы выросли на {pct}%",
        "spend_e": "{now} за {start}–{end} против {base} за те же дни прошлого месяца.",
        "tasks_t": "{n} {tasks_word}",
        "tasks_e": "Самая старая: «{title}», срок {day}. Перенесите, выполните или удалите то, что уже неактуально.",
        "goal_overdue_t": "«{title}»: срок цели прошёл",
        "goal_overdue_e": "Срок был {day}; прогресс {pct}%. Назначьте новую дату или отметьте цель выполненной или на паузе.",
        "goal_stale_t": "Нет прогресса по «{title}» уже {days_word}",
        "goal_stale_e": "Последнее изменение — {day}. Небольшой следующий шаг или задача, связанная с целью, помогут сдвинуться с места.",
    },
    "ko": {
        "budget_over_t": "{cat} 예산 초과",
        "budget_over_e": "{month}에 월 한도 {limit} 중 {spent}를 썼어요 ({over} 초과).",
        "budget_warn_t": "{cat} 예산 {pct}% 사용",
        "budget_warn_e": "{limit} 중 {left} 남았고, 이번 달은 {days}일 남았어요.",
        "kind_installment": "할부 상환", "kind_recurring": "정기 결제",
        "pay_overdue_t": "{name} 결제일이 {day}이었어요",
        "pay_overdue_e": "{day}에 예정된 {amount} {kind}이(가) 아직 기록되지 않았어요. 결제했다면 확인하고, 아니라면 건너뛰세요.",
        "when_today": "오늘", "when_tomorrow": "내일", "when_days": "{days}일 후",
        "pay_due_t": "{name} 결제 예정: {when}",
        "pay_due_e": "{day}에 {amount} {kind}이(가) 예정되어 있어요.",
        "cash_t": "예정된 결제가 보유 {cur}보다 많아요",
        "cash_e": "앞으로 {window}일 동안 정기 결제와 할부로 {amount}가 나갈 예정인데, 활성 {cur} 계좌 잔액은 {available}이에요. 예상 수입은 포함되지 않은 추정치예요.",
        "spend_t": "{cat} 지출 {pct}% 증가",
        "spend_e": "{start}–{end} 동안 {now}, 지난달 같은 기간에는 {base}였어요.",
        "tasks_t": "기한 지난 할 일 {n}개",
        "tasks_e": "가장 오래된 할 일: “{title}”, 기한 {day}. 일정을 바꾸거나 완료하거나, 더 이상 필요 없으면 삭제하세요.",
        "goal_overdue_t": "“{title}” 목표일이 지났어요",
        "goal_overdue_e": "목표일은 {day}이었고 진행률은 {pct}%예요. 새 날짜를 정하거나 완료/일시중지로 표시하세요.",
        "goal_stale_t": "“{title}” {days}일째 진행 없음",
        "goal_stale_e": "마지막 변경일은 {day}이에요. 작은 다음 단계나 이 목표에 연결된 할 일로 다시 시작해 보세요.",
    },
}


def _t(key: str, **kw) -> str:
    lang = current()
    if lang == "ru":
        if "days" in kw:
            kw.setdefault("days_word", f"{kw['days']} {plural(int(kw['days']), 'день', 'дня', 'дней')}")
        if "n" in kw:
            kw.setdefault("tasks_word", plural(int(kw["n"]), "просроченная задача", "просроченные задачи", "просроченных задач"))
    return TEXT.get(lang, TEXT["en"])[key].format(**kw)


def _fmt(amount: Decimal, currency: str) -> str:
    return f"{q(amount):,.2f} {currency}".replace(",", " ")


def budget_rules(db: Session, today: date) -> list[Insight]:
    month = budget_month(db, today)
    out = []
    for line in month["lines"]:
        cur = month["currency"]
        if line["status"] == "over":
            out.append(Insight(
                key=f"budget-over:{line['category_id']}:{month['month']}", severity="critical", category="finance",
                title=_t("budget_over_t", cat=category_name(line["category_name"])),
                explanation=_t("budget_over_e", spent=_fmt(line["spent"], cur), limit=_fmt(line["limit"], cur),
                               over=_fmt(-line["remaining"], cur), month=fmt_month(date.fromisoformat(month["month"] + "-01"))),
                link=f"/finances/budgets?month={month['month']}"))
        elif line["status"] == "warning":
            out.append(Insight(
                key=f"budget-warn:{line['category_id']}:{month['month']}", severity="warning", category="finance",
                title=_t("budget_warn_t", cat=category_name(line["category_name"]), pct=line["utilization"]),
                explanation=_t("budget_warn_e", left=_fmt(line["remaining"], cur), limit=_fmt(line["limit"], cur),
                               days=(add_months(month_start(today), 1) - today).days),
                link=f"/finances/budgets?month={month['month']}"))
    return out


def upcoming_payment_rules(db: Session, today: date) -> list[Insight]:
    out = []
    items = recurring.expected_payments(db, UPCOMING_DAYS, today) + inst.upcoming_installments(db, UPCOMING_DAYS, today)
    for p in items:
        if p["type"] != "expense":
            continue
        kind = _t("kind_installment") if p["kind"] == "installment" else _t("kind_recurring")
        amount = _fmt(p["amount"], p["currency"])
        link = "/finances/installments" if p["kind"] == "installment" else "/finances/recurring"
        if p["overdue"]:
            out.append(Insight(
                key=f"{p['kind']}-overdue:{p['source_id']}:{p['due_date']}", severity="critical", category="finance",
                title=_t("pay_overdue_t", name=p["name"], day=fmt_day(p["due_date"])),
                explanation=_t("pay_overdue_e", kind=kind, amount=amount, day=fmt_day(p["due_date"])),
                link=link, estimate=True))
        else:
            days = (p["due_date"] - today).days
            when = _t("when_today") if days == 0 else _t("when_tomorrow") if days == 1 else _t("when_days", days=days)
            out.append(Insight(
                key=f"{p['kind']}-due:{p['source_id']}:{p['due_date']}", severity="info", category="finance",
                title=_t("pay_due_t", name=p["name"], when=when),
                explanation=_t("pay_due_e", kind=kind, kind_lower=kind.lower(), amount=amount, day=fmt_day(p["due_date"])),
                link=link, estimate=True))
    return out


def cash_coverage_rule(db: Session, today: date) -> list[Insight]:
    """Expected outflows in the next 14 days vs. currently available cash (estimate)."""
    window = 14
    due: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for p in recurring.expected_payments(db, window, today) + inst.upcoming_installments(db, window, today):
        if p["type"] == "expense":
            due[p["currency"]] += p["amount"]
    if not due:
        return []
    cash = acc_svc.totals_by_currency(db)
    out = []
    for cur, amount in due.items():
        available = cash.get(cur, ZERO)
        if amount > available:
            out.append(Insight(
                key=f"cash-coverage:{cur}:{today}", severity="warning", category="finance",
                title=_t("cash_t", cur=cur),
                explanation=_t("cash_e", amount=_fmt(amount, cur), window=window, cur=cur, available=_fmt(available, cur)),
                link="/finances/recurring", estimate=True))
    return out


def spending_increase_rule(db: Session, today: date) -> list[Insight]:
    """Month-to-date spending vs. the same days of last month, per category.

    Fires only if transaction history starts on or before the first day of last
    month, so a partially tracked month is never compared."""
    first = first_transaction_date(db)
    this_start = month_start(today)
    prev_start = add_months(this_start, -1)
    if first is None or first > prev_start or today.day < 7:
        return []
    currency = get_app_settings(db).primary_currency
    prev_same_day = min(add_months(today, -1), this_start - timedelta(days=1))
    now = spending_by_category(db, this_start, today, currency)
    before = spending_by_category(db, prev_start, prev_same_day, currency)
    prev_total = sum(before.values(), ZERO)
    if prev_total == 0:
        return []
    out = []
    for cid, amount in now.items():
        base = before.get(cid, ZERO)
        if base == 0 or (base * 100 / prev_total) < SPEND_INCREASE_MIN_SHARE:
            continue
        change = percent(amount - base, base)
        if change is not None and change >= SPEND_INCREASE_PCT:
            cat = db.get(Category, cid)
            out.append(Insight(
                key=f"spend-up:{cid}:{this_start:%Y-%m}", severity="info", category="finance",
                title=_t("spend_t", cat=category_name(cat.name), pct=change),
                explanation=_t("spend_e", now=_fmt(amount, currency), start=fmt_day(this_start), end=fmt_day(today),
                               base=_fmt(base, currency)),
                link=f"/finances/transactions?category_id={cid}&start={this_start}&end={today}"))
    return out


def task_rules(db: Session, today: date) -> list[Insight]:
    overdue = list(db.scalars(select(Task).where(Task.status != "done", Task.due_date < today)
                              .order_by(Task.due_date)))
    if not overdue:
        return []
    oldest = overdue[0]
    return [Insight(
        key=f"tasks-overdue:{today}", severity="warning", category="tasks",
        title=_t("tasks_t", n=len(overdue), s="s" if len(overdue) != 1 else ""),
        explanation=_t("tasks_e", title=oldest.title, day=fmt_day(oldest.due_date)),
        link="/tasks?view=overdue")]


def goal_rules(db: Session, today: date) -> list[Insight]:
    out = []
    now = datetime.now(timezone.utc)
    for goal in db.scalars(select(Goal).where(Goal.status == "active", Goal.archived_at.is_(None))):
        if goal.target_date and goal.target_date < today:
            out.append(Insight(
                key=f"goal-overdue:{goal.id}", severity="warning", category="goals",
                title=_t("goal_overdue_t", title=goal.title),
                explanation=_t("goal_overdue_e", day=fmt_day(goal.target_date), pct=compute_progress(goal)),
                link=f"/goals?goal={goal.id}"))
            continue
        last = goal.last_progress_at or goal.created_at
        if (now - goal.created_at).days >= GOAL_STALE_DAYS and (now - last).days >= GOAL_STALE_DAYS:
            out.append(Insight(
                key=f"goal-stale:{goal.id}:{last.date()}", severity="info", category="goals",
                title=_t("goal_stale_t", title=goal.title, days=(now - last).days),
                explanation=_t("goal_stale_e", day=fmt_day(last.date())),
                link=f"/goals?goal={goal.id}"))
    return out


RULES = [budget_rules, upcoming_payment_rules, cash_coverage_rule, spending_increase_rule, task_rules, goal_rules]


def compute(db: Session, today: date | None = None, include_dismissed: bool = False) -> list[dict]:
    today = today or today_for(db)
    items: list[Insight] = []
    for rule in RULES:
        items.extend(rule(db, today))
    dismissed = set(db.scalars(select(InsightDismissal.key)))
    if not include_dismissed:
        items = [i for i in items if i.key not in dismissed]
    items.sort(key=lambda i: (SEVERITY_ORDER[i.severity], i.category, i.title))
    return [{**asdict(i), "dismissed": i.key in dismissed} for i in items]


def dismiss(db: Session, key: str) -> None:
    if db.get(InsightDismissal, (current_user_id(), key)) is None:
        db.add(InsightDismissal(key=key))
        db.commit()


def restore_all(db: Session) -> int:
    n = db.query(InsightDismissal).delete()
    db.commit()
    return n


def count_overdue_tasks(db: Session, today: date) -> int:
    return db.scalar(select(func.count()).where(Task.status != "done", Task.due_date < today)) or 0
