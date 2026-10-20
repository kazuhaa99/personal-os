"""row-level security on every per-user table, and data grants for the app role

Run as the owner role. Grants go to POS_APP_DB_ROLE (default personal_os_app) only if
that role already exists; create it first (see README → Database roles) and re-run
`alembic upgrade head`, or run app.rls.grant_statements by hand.
"""
from typing import Sequence, Union

from alembic import op

from app.config import get_settings
from app.rls import disable_statements, enable_statements, grant_statements

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen list: the tables that carry user_id as of this revision.
TABLES = [
    "app_settings", "profile", "income_sources", "accounts", "categories", "recurring_rules", "transactions",
    "budget_limits", "installment_plans", "installment_payments", "goals", "goal_progress_logs", "projects",
    "milestones", "tasks", "habits", "habit_completions", "insight_dismissals",
]


def upgrade() -> None:
    for stmt in enable_statements(TABLES) + grant_statements(get_settings().app_db_role):
        op.execute(stmt)


def downgrade() -> None:
    for stmt in disable_statements(TABLES):
        op.execute(stmt)
