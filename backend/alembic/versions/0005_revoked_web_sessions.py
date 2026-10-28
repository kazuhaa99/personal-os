"""revoked web sessions: signing out ends the cookie's session on the server too

No row-level security (no user data; checked before anyone is signed in), like
`native_sessions`. Rows are deleted once the cookie would have expired anyway.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-28 10:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.config import get_settings
from app.rls import grant_statements

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "revoked_web_sessions",
        sa.Column("token_id", sa.String(32), primary_key=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_revoked_web_sessions_expires_at", "revoked_web_sessions", ["expires_at"])
    for stmt in grant_statements(get_settings().app_db_role):
        op.execute(stmt)


def downgrade() -> None:
    op.drop_table("revoked_web_sessions")
