"""Explicit SQLite transactions, shared by runtime and Alembic.

No connection, directory creation, or migration occurs on import/construction.
Relative environment paths are anchored at the repository root, just like default.
"""
import os
from contextlib import contextmanager
from functools import cached_property
from pathlib import Path

from sqlalchemy import URL, create_engine, event, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from activity_hub.errors import StorageUnavailable
from activity_hub.models import (
    Account, ActionThrottle, ActivityCheck, Front, IdempotencyRequest, WebSession,
)

# Keep the original data path and relative-path contract after archival.
ROOT = Path(__file__).resolve().parents[3]
SCHEMA_REVISION = "0003"
_WRITE_OPTION = "_activity_hub_write_transaction"


def database_path(path=None):
    if path is None:
        path = os.environ.get("ACTIVITY_HUB_DB_PATH") or ROOT / "data" / "activity.sqlite3"
    path = Path(path)
    return path if path.is_absolute() else ROOT / path


class Database:
    def __init__(self, path=None, *, busy_timeout_ms=3000):
        self.path = database_path(path)
        if not 1 <= busy_timeout_ms <= 60_000:
            raise ValueError("A finite positive busy timeout is required")
        self.busy_timeout_ms = busy_timeout_ms

    @property
    def url(self):
        # URL objects avoid both URL parsing and ConfigParser's percent interpolation.
        return URL.create("sqlite+pysqlite", database=str(self.path))

    @cached_property
    def engine(self):
        engine = create_engine(
            self.url, connect_args={"check_same_thread": False, "timeout": self.busy_timeout_ms / 1000},
            hide_parameters=True,
        )

        @event.listens_for(engine, "connect")
        def configure_connection(connection, record):
            # SQLAlchemy's documented non-legacy transaction strategy. Do not also
            # set autocommit=False or change isolation_level via execution options.
            connection.isolation_level = None
            cursor = connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute(f"PRAGMA busy_timeout={self.busy_timeout_ms}")
            finally:
                cursor.close()

        @event.listens_for(engine, "begin")
        def begin_transaction(connection):
            statement = "BEGIN IMMEDIATE" if connection.get_execution_options().get(_WRITE_OPTION) else "BEGIN"
            connection.exec_driver_sql(statement)

        return engine

    @contextmanager
    def transaction(self, *, write=False):
        try:
            with self.engine.connect() as connection:
                connection = connection.execution_options(**{_WRITE_OPTION: write})
                with connection.begin():
                    with Session(bind=connection, expire_on_commit=False) as session:
                        # Session joins the explicit outer transaction; only that
                        # connection context commits. Exceptions roll everything back.
                        with session.begin():
                            yield session
        except (SQLAlchemyError, OSError):
            # Includes exhausted locks, unavailable storage, and unrelated constraint
            # failures; never misinterpret an arbitrary IntegrityError as a replay.
            raise StorageUnavailable() from None

    def schema_ready(self):
        if not self.path.is_file():
            return False  # Only the explicit migration command creates a database.
        try:
            with self.transaction() as session:
                versions = session.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
                if versions != [SCHEMA_REVISION]:
                    return False
                for model in (Account, Front, ActivityCheck, IdempotencyRequest, WebSession, ActionThrottle):
                    session.execute(select(model).limit(0))
            return True
        except StorageUnavailable:
            return False

    def dispose(self):
        engine = self.__dict__.get("engine")
        if engine is not None:
            engine.dispose()
