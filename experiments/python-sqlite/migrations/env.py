"""Manual migrations use exactly the application's SQLite connection setup."""
from alembic import context

from activity_hub.database import Database, _WRITE_OPTION
from activity_hub.models import Base

config = context.config
# Tests pass a temporary path explicitly; CLI uses only ACTIVITY_HUB_DB_PATH.
database = Database(config.attributes.get("database_path"))
target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(
        url=database.url, target_metadata=target_metadata, literal_binds=True,
        dialect_opts={"paramstyle": "named"}, transactional_ddl=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    # Only an explicit administrative migration may create the parent directory.
    database.path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with database.engine.connect() as connection:
            connection = connection.execution_options(**{_WRITE_OPTION: True})
            context.configure(
                connection=connection, target_metadata=target_metadata,
                transactional_ddl=True, render_as_batch=True, compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        database.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
