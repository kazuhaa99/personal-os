"""Relational schema for Personal OS.

Conventions
- Money is NUMERIC(14, 2) and always stored as a positive amount; the transaction
  type decides the direction. Balances are never stored, they are derived from the
  opening balance plus transactions so they cannot drift.
- Calendar dates (transaction date, due dates, habit days) are plain DATEs in the
  owner's configured timezone. Audit timestamps are TIMESTAMPTZ in UTC.
- Financial history is protected with ON DELETE RESTRICT: accounts and categories
  that are referenced by transactions can only be archived, not deleted.
- `is_demo` marks seed data so it can be removed in one action.
"""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.tenancy import Owned

MONEY = Numeric(14, 2)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# --------------------------------------------------------------------------- settings


class User(TimestampMixin, Base):
    """A login. Every Owned row belongs to exactly one user."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("username ~ '^[a-z0-9_.]{3,32}$'", name="username_format"),
        CheckConstraint("code_purpose IS NULL OR code_purpose IN ('verify','reset','change_email')", name="code_purpose"),
        Index("uq_users_username", text("lower(username)"), unique=True),
        Index("uq_users_email", text("lower(email)"), unique=True, postgresql_where=text("email <> ''")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str] = mapped_column(String(254), default="", nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_email: Mapped[str | None] = mapped_column(String(254))
    # One-time 6-digit code (email confirmation / password reset); only an HMAC is stored.
    code_purpose: Mapped[str | None] = mapped_column(String(16))
    code_hash: Mapped[str | None] = mapped_column(String(128))
    code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    code_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    code_attempts: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    # Bumped on password change: invalidates every existing session.
    session_epoch: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NativeSession(TimestampMixin, Base):
    """A signed-in native app (iOS / macOS shell): bearer tokens instead of the web cookie.

    Not Owned and without RLS, like `users`: a token is looked up before anyone is signed
    in. Only SHA-256 hashes of the tokens are stored. Refresh tokens carry the session's
    random `family` id, so presenting any already-rotated refresh token of the session is
    recognised and revokes it (see services/native_tokens.py). Password changes and resets
    delete the sessions.
    """

    __tablename__ = "native_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    family: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    device_name: Mapped[str] = mapped_column(String(64), default="", server_default="", nullable=False)
    access_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    refresh_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    refresh_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    # The refresh hash before the last rotation, and when that happened: a client whose
    # refresh response got lost may retry with it for a few seconds (REFRESH_RETRY_GRACE).
    prev_refresh_hash: Mapped[str | None] = mapped_column(String(64))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AppSettings(Owned, TimestampMixin, Base):
    """One row per user: preferences."""

    __tablename__ = "app_settings"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    owner_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    primary_currency: Mapped[str] = mapped_column(String(3), default="KZT", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Almaty", nullable=False)
    week_starts_on: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)  # 0 = Monday


class Profile(Owned, TimestampMixin, Base):
    """One row per user: the personal card. Everything is optional; the login email lives on User."""

    __tablename__ = "profile"
    __table_args__ = (
        CheckConstraint("salary_amount IS NULL OR salary_amount >= 0", name="salary_non_negative"),
        CheckConstraint("salary_frequency IN ('weekly','biweekly','monthly','quarterly','yearly')", name="salary_frequency"),
        CheckConstraint("payday IS NULL OR payday BETWEEN 1 AND 31", name="payday_range"),
    )

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    birthday: Mapped[date | None] = mapped_column(Date)
    city: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    occupation: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    employer: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    bio: Mapped[str] = mapped_column(Text, default="", nullable=False)
    salary_amount: Mapped[Decimal | None] = mapped_column(MONEY)
    salary_currency: Mapped[str] = mapped_column(String(3), default="KZT", nullable=False)
    salary_frequency: Mapped[str] = mapped_column(String(16), default="monthly", nullable=False)
    payday: Mapped[int | None] = mapped_column(SmallInteger)
    avatar: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    avatar_type: Mapped[str | None] = mapped_column(String(32))
    avatar_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class IncomeSource(Owned, TimestampMixin, Base):
    """Additional income the owner expects (side jobs, rent, dividends…). Planning data, not transactions."""

    __tablename__ = "income_sources"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("frequency IN ('weekly','biweekly','monthly','quarterly','yearly')", name="frequency"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="KZT", nullable=False)
    frequency: Mapped[str] = mapped_column(String(16), default="monthly", nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# --------------------------------------------------------------------------- finance


class Account(Owned, TimestampMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("type IN ('cash','bank','savings','other')", name="type"),
        CheckConstraint("char_length(currency) = 3", name="currency_len"),
        UniqueConstraint("user_id", "name", name="uq_accounts_user_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KZT")
    opening_balance: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    opening_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Category(Owned, TimestampMixin, Base):
    """Income or expense category. Transfers never have a category."""

    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("kind IN ('income','expense')", name="kind"),
        UniqueConstraint("user_id", "kind", "name", name="uq_categories_user_kind_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    color: Mapped[str] = mapped_column(String(9), default="#8b8b94", nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Transaction(Owned, TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("type IN ('income','expense','transfer')", name="type"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "(type = 'transfer' AND to_account_id IS NOT NULL AND category_id IS NULL "
            "AND to_account_id <> account_id) OR (type <> 'transfer' AND to_account_id IS NULL)",
            name="transfer_shape",
        ),
        CheckConstraint(
            "(recurring_rule_id IS NULL) = (recurring_occurrence_date IS NULL)",
            name="recurring_pair",
        ),
        UniqueConstraint(
            "recurring_rule_id", "recurring_occurrence_date", name="uq_transactions_recurring_occurrence"
        ),
        Index("ix_transactions_date", "date"),
        Index("ix_transactions_account_date", "account_id", "date"),
        Index("ix_transactions_to_account", "to_account_id"),
        Index("ix_transactions_category_date", "category_id", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False)
    to_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    payee: Mapped[str | None] = mapped_column(String(120))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, nullable=False)
    recurring_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_rules.id", ondelete="SET NULL")
    )
    recurring_occurrence_date: Mapped[date | None] = mapped_column(Date)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    account: Mapped[Account] = relationship(foreign_keys=[account_id], lazy="joined")
    to_account: Mapped[Account | None] = relationship(foreign_keys=[to_account_id], lazy="joined")
    category: Mapped[Category | None] = relationship(lazy="joined")


class BudgetLimit(Owned, TimestampMixin, Base):
    """Monthly spending limit for an expense category, effective from `effective_month`
    until a later row for the same category replaces it. A row with is_active = false
    disables the budget from that month on. History is therefore preserved."""

    __tablename__ = "budget_limits"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        CheckConstraint("extract(day from effective_month) = 1", name="first_of_month"),
        UniqueConstraint("category_id", "effective_month", name="uq_budget_limits_category_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    effective_month: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    category: Mapped[Category] = relationship(lazy="joined")


FREQUENCIES = "('weekly','biweekly','monthly','quarterly','yearly')"


class RecurringRule(Owned, TimestampMixin, Base):
    """An *expected* repeating income/expense. It never moves money on its own;
    the owner confirms an occurrence, which records a real transaction."""

    __tablename__ = "recurring_rules"
    __table_args__ = (
        CheckConstraint("type IN ('income','expense')", name="type"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(f"frequency IN {FREQUENCIES}", name="frequency"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="date_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    type: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    frequency: Mapped[str] = mapped_column(String(10), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    next_due_date: Mapped[date | None] = mapped_column(Date)  # NULL once the schedule has ended
    end_date: Mapped[date | None] = mapped_column(Date)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False)
    payee: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    account: Mapped[Account] = relationship(lazy="joined")
    category: Mapped[Category] = relationship(lazy="joined")


class InstallmentPlan(Owned, TimestampMixin, Base):
    """A manually tracked repayment obligation (installment, loan, debt).

    outstanding = starting_outstanding - sum(payments). Creating a plan never
    changes an account balance."""

    __tablename__ = "installment_plans"
    __table_args__ = (
        CheckConstraint("original_amount > 0", name="original_positive"),
        CheckConstraint(
            "starting_outstanding >= 0 AND starting_outstanding <= original_amount", name="starting_range"
        ),
        CheckConstraint("payment_amount > 0", name="payment_positive"),
        CheckConstraint(f"frequency IN {FREQUENCIES}", name="frequency"),
        CheckConstraint("status IN ('active','paused','paid_off','cancelled')", name="status"),
        CheckConstraint("char_length(currency) = 3", name="currency_len"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    lender: Mapped[str | None] = mapped_column(String(120))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KZT")
    original_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    starting_outstanding: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    payment_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    frequency: Mapped[str] = mapped_column(String(10), nullable=False)
    next_payment_date: Mapped[date | None] = mapped_column(Date)
    final_payment_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="active", nullable=False)
    default_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    payments: Mapped[list[InstallmentPayment]] = relationship(
        back_populates="plan", order_by="InstallmentPayment.date", lazy="selectin"
    )


class InstallmentPayment(Owned, TimestampMixin, Base):
    """Reduction of an obligation. If `transaction_id` is set, the cash movement and
    the expense live in that transaction (counted once in analytics); this row only
    records the liability reduction."""

    __tablename__ = "installment_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        UniqueConstraint("transaction_id", name="uq_installment_payments_transaction_id"),
        Index("ix_installment_payments_plan_date", "plan_id", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("installment_plans.id", ondelete="RESTRICT"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id", ondelete="RESTRICT"))
    note: Mapped[str | None] = mapped_column(String(255))

    plan: Mapped[InstallmentPlan] = relationship(back_populates="payments")


# --------------------------------------------------------------------------- planning


class Goal(Owned, TimestampMixin, Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("status IN ('active','paused','completed')", name="status"),
        CheckConstraint("progress_mode IN ('manual','milestones','target')", name="progress_mode"),
        CheckConstraint("manual_progress BETWEEN 0 AND 100", name="manual_progress_range"),
        CheckConstraint(
            "progress_mode <> 'target' OR (target_value IS NOT NULL AND target_value > 0)", name="target_required"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), default="personal", nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="active", nullable=False)
    progress_mode: Mapped[str] = mapped_column(String(10), default="manual", nullable=False)
    manual_progress: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    target_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    current_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20))
    last_progress_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    milestones: Mapped[list[Milestone]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="Milestone.position", lazy="selectin"
    )
    progress_logs: Mapped[list[GoalProgressLog]] = relationship(
        cascade="all, delete-orphan", order_by="GoalProgressLog.recorded_at", lazy="selectin"
    )


class GoalProgressLog(Owned, Base):
    __tablename__ = "goal_progress_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    progress: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))


class Project(Owned, TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (CheckConstraint("status IN ('active','on_hold','completed')", name="status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="active", nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Milestone(Owned, TimestampMixin, Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    goal: Mapped[Goal] = relationship(back_populates="milestones")


class Task(Owned, TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("status IN ('todo','in_progress','done')", name="status"),
        CheckConstraint("priority IN ('low','medium','high','urgent')", name="priority"),
        CheckConstraint("recurrence IN ('none','daily','weekdays','weekly','monthly')", name="recurrence"),
        CheckConstraint("recurrence = 'none' OR due_date IS NOT NULL", name="recurring_needs_due"),
        CheckConstraint("due_time IS NULL OR due_date IS NOT NULL", name="time_needs_date"),
        # A recurring series can only have one instance per due date, so completing
        # the same instance twice can never spawn duplicate follow-ups.
        UniqueConstraint("series_id", "due_date", name="uq_tasks_series_due"),
        Index("ix_tasks_status_due", "status", "due_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    due_time: Mapped[time | None] = mapped_column(Time)
    priority: Mapped[str] = mapped_column(String(8), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="todo", nullable=False)
    category: Mapped[str | None] = mapped_column(String(40))
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    recurrence: Mapped[str] = mapped_column(String(10), default="none", nullable=False)
    series_id: Mapped[str | None] = mapped_column(String(36))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Habit(Owned, TimestampMixin, Base):
    __tablename__ = "habits"
    __table_args__ = (
        CheckConstraint("schedule IN ('daily','weekdays')", name="schedule"),
        # Bitmask Mon=1 ... Sun=64. Required (non-zero) for the 'weekdays' schedule.
        CheckConstraint("weekday_mask BETWEEN 0 AND 127", name="mask_range"),
        CheckConstraint("schedule = 'daily' OR weekday_mask > 0", name="mask_required"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    schedule: Mapped[str] = mapped_column(String(10), default="daily", nullable=False)
    weekday_mask: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    color: Mapped[str] = mapped_column(String(9), default="#7c9cff", nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class HabitCompletion(Owned, Base):
    __tablename__ = "habit_completions"
    __table_args__ = (UniqueConstraint("habit_id", "date", name="uq_habit_completions_habit_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# --------------------------------------------------------------------------- insights


class InsightDismissal(Owned, Base):
    """Insights are computed on demand by deterministic rules; only the owner's
    dismissals are persisted. Keys embed their period (e.g. the month), so a
    dismissed alert returns naturally when the situation recurs."""

    __tablename__ = "insight_dismissals"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    dismissed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
