from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.config import get_settings
from app.db import Base
from app.rls import grant_statements

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
# Migrations need the owner role (ALTER TABLE, policies, grants), not the app's restricted role.
config.set_main_option("sqlalchemy.url", get_settings().migration_database_url or get_settings().database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata,
                      literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.",
                                     poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
            # Idempotent: (re)grant data access to the app role, so a role created after
            # migration 0003 still gets its rights on the next `alembic upgrade head`.
            if context.get_context().get_current_revision() is not None:
                for stmt in grant_statements(get_settings().app_db_role):
                    connection.execute(text(stmt))


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
