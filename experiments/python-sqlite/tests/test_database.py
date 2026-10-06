import json
import subprocess
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic import command
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError

from activity_hub.contracts import FrontCreate
from activity_hub.database import Database, SCHEMA_REVISION
from activity_hub.errors import StorageUnavailable
from activity_hub.operations import Operations
from tests.helpers import ROOT, create_account, migrate, migration_config


class DatabaseAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "activity.sqlite3"
        migrate(self.path)
        self.database = Database(self.path)
        self.addCleanup(self.database.dispose)
        self.account_id = create_account(self.database)
        self.operations = Operations(self.database, clock=lambda: datetime(2026, 10, 3, tzinfo=UTC)).with_account(self.account_id)
        self.front = self.operations.create_front(FrontCreate(name="A"), uuid4())

    def reject(self, statement, parameters):
        with self.database.engine.connect() as connection:
            with self.assertRaises(IntegrityError):
                with connection.begin():
                    connection.execute(text(statement), parameters)

    def test_foreign_keys_are_enabled_on_every_separate_connection(self):
        with self.database.engine.connect() as first, self.database.engine.connect() as second:
            self.assertIsNot(first.connection.dbapi_connection, second.connection.dbapi_connection)
            for connection in (first, second):
                self.assertEqual(connection.exec_driver_sql("PRAGMA foreign_keys").scalar(), 1)
                self.assertGreater(connection.exec_driver_sql("PRAGMA busy_timeout").scalar(), 0)
        self.reject("INSERT INTO activity_checks (front_id, day) VALUES (:id, :day)",
                    {"id": uuid4().hex, "day": "2026-10-03"})

    def test_database_enforces_per_front_day_uniqueness(self):
        statement = "INSERT INTO activity_checks (front_id, day) VALUES (:id, :day)"
        parameters = {"id": self.front.id.hex, "day": "2026-10-03"}
        with self.database.engine.begin() as connection:
            connection.execute(text(statement), parameters)
        self.reject(statement, parameters)

    def test_database_name_link_and_state_constraints(self):
        for field, value in (("name", ""), ("name", " \t\n\u2003"), ("name", " leading"), ("name", "x" * 201),
                             ("name", "\x00"), ("name", "A\x00B"), ("name", "A\x00" + "x" * 200),
                             ("state", "closed"), ("reference", "javascript:bad"), ("reference", "https://" + "x" * 2048)):
            with self.subTest(field=field):
                self.reject(f"UPDATE fronts SET {field} = :value WHERE id = :id", {"value": value, "id": self.front.id.hex})
        self.reject("UPDATE fronts SET name = NULL WHERE id = :id", {"id": self.front.id.hex})
        self.assertEqual(self.operations.get_front(self.front.id).name, "A")

    def test_database_rejects_invalid_calendar_dates(self):
        for day in ("2026-02-30", "2026-13-01", "2026-1-01", "20261003", "0000-01-01", "nonsense", None):
            with self.subTest(day=day):
                self.reject("INSERT INTO activity_checks (front_id, day) VALUES (:id, :day)",
                            {"id": self.front.id.hex, "day": day})

    def test_request_table_has_unique_keys_and_json_operation_constraints(self):
        with self.database.engine.connect() as connection:
            row = connection.exec_driver_sql("SELECT * FROM idempotency_requests").mappings().one()
            key = row["key"]
        self.reject("UPDATE idempotency_requests SET operation='delete_front' WHERE key=:key", {"key": key})
        self.reject("UPDATE idempotency_requests SET payload='not-json' WHERE key=:key", {"key": key})
        self.reject("UPDATE idempotency_requests SET response='not-json' WHERE key=:key", {"key": key})
        self.reject("INSERT INTO idempotency_requests SELECT * FROM idempotency_requests WHERE key=:key", {"key": key})

    def test_select_starts_a_real_sqlite_read_transaction(self):
        with self.database.transaction() as session:
            raw = session.connection().connection.dbapi_connection
            self.assertTrue(raw.in_transaction)
            session.execute(text("SELECT name FROM fronts"))
            self.assertTrue(raw.in_transaction)
        self.assertFalse(raw.in_transaction)

    def test_read_snapshot_blocks_separate_writer_commit_until_read_finishes(self):
        other = Database(self.path, busy_timeout_ms=100)
        self.addCleanup(other.dispose)
        selected = threading.Barrier(2)
        with self.database.transaction() as reader:
            self.assertEqual(reader.execute(text("SELECT name FROM fronts")).scalar(), "A")
            @event.listens_for(other.engine, "connect")
            def before_write(connection, record):
                selected.wait(timeout=5)
            with ThreadPoolExecutor(max_workers=1) as executor:
                def write():
                    with other.transaction(write=True) as session:
                        session.execute(text("UPDATE fronts SET name='B'"))
                future = executor.submit(write)
                selected.wait(timeout=5)
                with self.assertRaises(StorageUnavailable):
                    future.result(timeout=5)
                self.assertEqual(reader.execute(text("SELECT name FROM fronts")).scalar(), "A")
        self.assertEqual(self.operations.get_front(self.front.id).name, "A")

    def test_begin_immediate_exhaustion_is_finite_generic_and_rolls_back(self):
        other = Database(self.path, busy_timeout_ms=100)
        self.addCleanup(other.dispose)
        arrived = threading.Barrier(2)
        @event.listens_for(other.engine, "connect")
        def connection_created(connection, record):
            arrived.wait(timeout=5)
        with self.database.transaction(write=True):
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(Operations(other).with_account(self.account_id).create_front, FrontCreate(name="Private"), uuid4())
                arrived.wait(timeout=5)
                with self.assertRaises(StorageUnavailable) as caught:
                    future.result(timeout=5)
                self.assertEqual(caught.exception.status_code, 503)
                self.assertNotIn("Private", str(caught.exception))
                self.assertNotIn(str(self.path), str(caught.exception))
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM fronts")).scalar(), 1)
            self.assertEqual(session.execute(text("SELECT count(*) FROM idempotency_requests")).scalar(), 1)

    def test_sqlite_ddl_and_savepoint_are_part_of_outer_transaction(self):
        with self.database.engine.connect() as connection:
            transaction = connection.begin()
            connection.exec_driver_sql("CREATE TABLE rollback_probe (value INTEGER)")
            with connection.begin_nested():
                connection.exec_driver_sql("INSERT INTO rollback_probe VALUES (1)")
            transaction.rollback()
        with self.database.engine.connect() as connection:
            self.assertEqual(connection.exec_driver_sql("SELECT count(*) FROM sqlite_master WHERE name='rollback_probe'").scalar(), 0)

    def test_upgrade_twice_and_alembic_check_leave_schema_and_data_intact(self):
        command.upgrade(migration_config(self.path), "head")
        command.check(migration_config(self.path))
        self.assertEqual(self.operations.get_front(self.front.id).name, "A")
        with self.database.engine.connect() as connection:
            self.assertEqual(connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar(), SCHEMA_REVISION)

    def test_additive_0002_preserves_0001_domain_and_replay_rows_without_bootstrap(self):
        old_path = Path(self.temp.name) / "upgrade.sqlite3"
        command.upgrade(migration_config(old_path), "0001")
        old_database = Database(old_path)
        self.addCleanup(old_database.dispose)
        front_id, key = uuid4(), uuid4()
        with old_database.transaction(write=True) as session:
            session.execute(text("INSERT INTO fronts VALUES (:id, 'Upgrade fixture', NULL, 'open', '2026-10-03 00:00:00', '2026-10-03 00:00:00')"), {"id": front_id.hex})
            session.execute(text("INSERT INTO activity_checks VALUES (:id, '2026-10-02')"), {"id": front_id.hex})
            session.execute(text("INSERT INTO idempotency_requests VALUES (:key, 'create_front', NULL, '{}', '{}', '2026-10-03 00:00:00')"), {"key": key.hex})
        with old_database.transaction() as session:
            before = {table: session.execute(text(f"SELECT * FROM {table}")).all()
                      for table in ("fronts", "activity_checks", "idempotency_requests")}
        self.assertFalse(old_database.schema_ready())
        command.upgrade(migration_config(old_path), "0002")
        with old_database.transaction() as session:
            for table, rows in before.items():
                self.assertEqual(session.execute(text(f"SELECT * FROM {table}")).all(), rows)
            for table in ("private_owner", "web_sessions", "login_throttle"):
                self.assertEqual(session.execute(text(f"SELECT count(*) FROM {table}")).scalar(), 0)
            self.assertEqual(session.execute(text("SELECT version_num FROM alembic_version")).scalar(), "0002")
        self.assertFalse(old_database.schema_ready())
        command.upgrade(migration_config(old_path), "head")
        command.check(migration_config(old_path))
        self.assertTrue(old_database.schema_ready())
        with old_database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 0)
            self.assertEqual(session.execute(text("SELECT DISTINCT account_id FROM fronts")).scalars().all(), [None])

    def test_schema_ready_requires_all_auth_tables(self):
        self.assertTrue(self.database.schema_ready())
        with self.database.engine.begin() as connection:
            connection.exec_driver_sql("DROP TABLE action_throttle")
        self.assertFalse(self.database.schema_ready())

    def test_readiness_requires_every_current_table_and_exact_revision(self):
        for table in ("accounts", "fronts", "activity_checks", "idempotency_requests", "web_sessions", "action_throttle"):
            path = Path(self.temp.name) / (table + ".sqlite3")
            migrate(path)
            database = Database(path)
            self.addCleanup(database.dispose)
            self.assertTrue(database.schema_ready())
            with database.engine.begin() as connection:
                connection.exec_driver_sql(f"DROP TABLE {table}")
            self.assertFalse(database.schema_ready(), table)
        with self.database.engine.begin() as connection:
            connection.exec_driver_sql("UPDATE alembic_version SET version_num='0002'")
        self.assertFalse(self.database.schema_ready())

    def test_cli_and_app_share_environment_path_containing_percent(self):
        path = Path(self.temp.name) / "nested%folder" / "db%name.sqlite3"
        environment = {"ACTIVITY_HUB_DB_PATH": str(path)}
        for arguments in (("upgrade", "head"), ("upgrade", "head"), ("check",)):
            result = subprocess.run([sys.executable, "-m", "alembic", *arguments],
                                    cwd=ROOT, env=environment, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = subprocess.run([sys.executable, "-c",
                                 "from activity_hub.app import app; print(app.state.database.schema_ready())"],
                                cwd=ROOT, env=environment, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "True")
        self.assertTrue(path.exists())

    def test_import_and_app_construction_do_not_create_directory_or_database(self):
        path = Path(self.temp.name) / "not-created" / "db.sqlite3"
        result = subprocess.run([sys.executable, "-c",
                                 "from activity_hub.app import app; from activity_hub.database import Database; "
                                 "print(app.state.database.path.parent.exists(), app.state.database.path.exists())"],
                                cwd=ROOT, env={"ACTIVITY_HUB_DB_PATH": str(path)}, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "False False")
        self.assertFalse(path.parent.exists())


if __name__ == "__main__":
    unittest.main()
