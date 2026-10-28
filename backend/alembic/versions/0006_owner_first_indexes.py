"""indexes that match how data is read

Every query filters by owner (row-level security), so the busiest lists get indexes that start
with user_id; the three foreign keys that had no index get one (account and category deletes
check them, and the recurring list joins them).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-28 12:00:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_transactions_user_date", "transactions", ["user_id", "date"])
    op.drop_index("ix_transactions_date", table_name="transactions")
    op.create_index("ix_tasks_user_status_due", "tasks", ["user_id", "status", "due_date"])
    op.drop_index("ix_tasks_status_due", table_name="tasks")
    op.create_index("ix_recurring_rules_account_id", "recurring_rules", ["account_id"])
    op.create_index("ix_recurring_rules_category_id", "recurring_rules", ["category_id"])
    op.create_index("ix_installment_plans_default_account_id", "installment_plans", ["default_account_id"])


def downgrade() -> None:
    op.drop_index("ix_installment_plans_default_account_id", table_name="installment_plans")
    op.drop_index("ix_recurring_rules_category_id", table_name="recurring_rules")
    op.drop_index("ix_recurring_rules_account_id", table_name="recurring_rules")
    op.create_index("ix_tasks_status_due", "tasks", ["status", "due_date"])
    op.drop_index("ix_tasks_user_status_due", table_name="tasks")
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.drop_index("ix_transactions_user_date", table_name="transactions")
