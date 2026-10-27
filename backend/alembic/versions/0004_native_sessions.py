"""native app sessions: bearer access + refresh tokens for the iOS / macOS shells

Like `users`, the table has no row-level security: a token is looked up before
anyone is signed in. Only SHA-256 hashes of the tokens are stored.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-27 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.config import get_settings
from app.rls import grant_statements

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "native_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family", sa.String(32), nullable=False, unique=True),
        sa.Column("device_name", sa.String(64), nullable=False, server_default=""),
        sa.Column("access_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("prev_refresh_hash", sa.String(64)),
        sa.Column("rotated_at", sa.DateTime(timezone=True)),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_native_sessions_user_id", "native_sessions", ["user_id"])
    op.create_index("ix_native_sessions_refresh_expires_at", "native_sessions", ["refresh_expires_at"])
    for stmt in grant_statements(get_settings().app_db_role):
        op.execute(stmt)


def downgrade() -> None:
    op.drop_table("native_sessions")
