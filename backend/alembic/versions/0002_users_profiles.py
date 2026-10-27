"""user accounts, per-user data, profile and income sources

Existing single-owner data is assigned to the first account (created here from
POS_AUTH_USERNAME / POS_AUTH_PASSWORD; without a password a random one is logged).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20 09:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FREQ = "('weekly','biweekly','monthly','quarterly','yearly')"

# Tables that existed in 0001 and now belong to a user.
OWNED = ["accounts", "categories", "transactions", "budget_limits", "recurring_rules", "installment_plans",
         "installment_payments", "goals", "goal_progress_logs", "projects", "milestones", "tasks", "habits",
         "habit_completions"]


def _user_fk(table: str, primary_key: bool = False) -> list:
    return [sa.Column("user_id", sa.Integer(), nullable=False, primary_key=primary_key),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f(f"fk_{table}_user_id_users"), ondelete="CASCADE")]


def _own_existing(table: str, admin_id: int) -> None:
    op.add_column(table, sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(sa.text(f"UPDATE {table} SET user_id = :uid").bindparams(uid=admin_id))
    op.alter_column(table, "user_id", nullable=False)
    op.create_foreign_key(op.f(f"fk_{table}_user_id_users"), table, "users", ["user_id"], ["id"], ondelete="CASCADE")
    op.create_index(op.f(f"ix_{table}_user_id"), table, ["user_id"])


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    from app.config import get_settings
    from app.services.auth import hash_password, initial_admin_password

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(32), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pending_email", sa.String(254), nullable=True),
        sa.Column("code_purpose", sa.String(16), nullable=True),
        sa.Column("code_hash", sa.String(128), nullable=True),
        sa.Column("code_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("code_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("code_attempts", sa.SmallInteger(), nullable=False),
        sa.Column("session_epoch", sa.Integer(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("username ~ '^[a-z0-9_.]{3,32}$'", name=op.f("ck_users_username_format")),
        sa.CheckConstraint("code_purpose IS NULL OR code_purpose IN ('verify','reset','change_email')", name=op.f("ck_users_code_purpose")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index("uq_users_username", "users", [sa.text("lower(username)")], unique=True)
    op.create_index("uq_users_email", "users", [sa.text("lower(email)")], unique=True, postgresql_where=sa.text("email <> ''"))

    s = get_settings()
    bind = op.get_bind()
    admin_id = bind.execute(sa.text(
        "INSERT INTO users (username, email, password_hash, code_attempts, session_epoch) "
        "VALUES (:u, '', :h, 0, 0) RETURNING id"), {"u": s.auth_username.strip().lower(), "h": hash_password(initial_admin_password())}).scalar_one()

    for table in OWNED:
        _own_existing(table, admin_id)
    op.drop_constraint(op.f("uq_accounts_name"), "accounts", type_="unique")
    op.create_unique_constraint(op.f("uq_accounts_user_name"), "accounts", ["user_id", "name"])
    op.drop_constraint(op.f("uq_categories_kind_name"), "categories", type_="unique")
    op.create_unique_constraint(op.f("uq_categories_user_kind_name"), "categories", ["user_id", "kind", "name"])

    # app_settings: one row per user instead of a singleton
    op.add_column("app_settings", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(sa.text("UPDATE app_settings SET user_id = :uid").bindparams(uid=admin_id))
    op.drop_constraint(op.f("ck_app_settings_singleton"), "app_settings", type_="check")
    op.drop_constraint(op.f("pk_app_settings"), "app_settings", type_="primary")
    op.drop_column("app_settings", "id")
    op.alter_column("app_settings", "user_id", nullable=False)
    op.create_primary_key(op.f("pk_app_settings"), "app_settings", ["user_id"])
    op.create_foreign_key(op.f("fk_app_settings_user_id_users"), "app_settings", "users", ["user_id"], ["id"], ondelete="CASCADE")

    # insight_dismissals: keyed per user
    op.add_column("insight_dismissals", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(sa.text("UPDATE insight_dismissals SET user_id = :uid").bindparams(uid=admin_id))
    op.alter_column("insight_dismissals", "user_id", nullable=False)
    op.drop_constraint(op.f("pk_insight_dismissals"), "insight_dismissals", type_="primary")
    op.create_primary_key(op.f("pk_insight_dismissals"), "insight_dismissals", ["user_id", "key"])
    op.create_foreign_key(op.f("fk_insight_dismissals_user_id_users"), "insight_dismissals", "users", ["user_id"], ["id"], ondelete="CASCADE")

    op.create_table(
        "profile",
        *_user_fk("profile", primary_key=True),
        sa.Column("first_name", sa.String(80), nullable=False),
        sa.Column("last_name", sa.String(80), nullable=False),
        sa.Column("phone", sa.String(40), nullable=False),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("city", sa.String(80), nullable=False),
        sa.Column("occupation", sa.String(120), nullable=False),
        sa.Column("employer", sa.String(120), nullable=False),
        sa.Column("bio", sa.Text(), nullable=False),
        sa.Column("salary_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("salary_currency", sa.String(3), nullable=False),
        sa.Column("salary_frequency", sa.String(16), nullable=False),
        sa.Column("payday", sa.SmallInteger(), nullable=True),
        sa.Column("avatar", sa.LargeBinary(), nullable=True),
        sa.Column("avatar_type", sa.String(32), nullable=True),
        sa.Column("avatar_version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint("salary_amount IS NULL OR salary_amount >= 0", name=op.f("ck_profile_salary_non_negative")),
        sa.CheckConstraint(f"salary_frequency IN {FREQ}", name=op.f("ck_profile_salary_frequency")),
        sa.CheckConstraint("payday IS NULL OR payday BETWEEN 1 AND 31", name=op.f("ck_profile_payday_range")),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_profile")),
    )
    op.execute(sa.text(
        "INSERT INTO profile (user_id, first_name, last_name, phone, city, occupation, employer, bio, salary_currency, "
        "salary_frequency, avatar_version) SELECT :uid, owner_name, '', '', '', '', '', '', primary_currency, 'monthly', 0 "
        "FROM app_settings WHERE user_id = :uid").bindparams(uid=admin_id))

    op.create_table(
        "income_sources",
        sa.Column("id", sa.Integer(), nullable=False),
        *_user_fk("income_sources"),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("frequency", sa.String(16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint("amount > 0", name=op.f("ck_income_sources_amount_positive")),
        sa.CheckConstraint(f"frequency IN {FREQ}", name=op.f("ck_income_sources_frequency")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_income_sources")),
    )
    op.create_index(op.f("ix_income_sources_user_id"), "income_sources", ["user_id"])


def downgrade() -> None:
    """Back to single-owner: keeps only the first account's data."""
    op.drop_table("income_sources")
    op.drop_table("profile")
    first = "(SELECT min(id) FROM users)"
    for table in ["insight_dismissals", "app_settings", *reversed(OWNED)]:
        op.execute(sa.text(f"DELETE FROM {table} WHERE user_id <> {first}"))
    op.drop_constraint(op.f("pk_insight_dismissals"), "insight_dismissals", type_="primary")
    op.drop_column("insight_dismissals", "user_id")
    op.create_primary_key(op.f("pk_insight_dismissals"), "insight_dismissals", ["key"])
    op.drop_constraint(op.f("pk_app_settings"), "app_settings", type_="primary")
    op.drop_column("app_settings", "user_id")
    op.add_column("app_settings", sa.Column("id", sa.Integer(), nullable=False, server_default="1"))
    op.create_primary_key(op.f("pk_app_settings"), "app_settings", ["id"])
    op.create_check_constraint(op.f("ck_app_settings_singleton"), "app_settings", "id = 1")
    op.drop_constraint(op.f("uq_categories_user_kind_name"), "categories", type_="unique")
    op.create_unique_constraint(op.f("uq_categories_kind_name"), "categories", ["kind", "name"])
    op.drop_constraint(op.f("uq_accounts_user_name"), "accounts", type_="unique")
    op.create_unique_constraint(op.f("uq_accounts_name"), "accounts", ["name"])
    for table in OWNED:
        op.drop_column(table, "user_id")
    op.drop_table("users")
