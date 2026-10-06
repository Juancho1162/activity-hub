"""Populated 0002 upgrades are atomic, preserve credentials/data, and revoke sessions."""
import hashlib
import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

from alembic import command
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from activity_hub.auth import AuthService
from activity_hub.contracts import CheckWrite, FrontCreate, FrontQuery, HistoryQuery
from activity_hub.database import Database
from activity_hub.errors import DomainError
from activity_hub.operations import Operations
from tests.helpers import migrate, migration_config

NOW = datetime(2026, 10, 4, 12, tzinfo=UTC)
CODE = "A" * 32
NEW_CODE = "B" * 32
VERIFIER = hashlib.sha256(b"activity-hub:access-code:v1:" + CODE.encode()).hexdigest()


class MigrationMultiaccountAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "legacy.sqlite3"
        command.upgrade(migration_config(self.path), "0002")
        self.database = Database(self.path)
        self.addCleanup(self.database.dispose)
        self.ids = [uuid4() for _ in range(3)]
        self.create_key, self.check_key = uuid4(), uuid4()
        front_response = {"id": str(self.ids[0]), "name": "Legacy", "reference": None,
                          "state": "open", "created_at": NOW.isoformat(), "updated_at": NOW.isoformat()}
        self.response = json.dumps(front_response, indent=2)
        with self.database.transaction(write=True) as session:
            for front_id, state in zip(self.ids, ("open", "standby", "archived")):
                session.execute(text("INSERT INTO fronts VALUES (:id, 'Legacy', NULL, :state, :created, :updated)"),
                                {"id": front_id.hex, "state": state, "created": "2026-10-04 12:00:00", "updated": "2026-10-04 12:00:00"})
                session.execute(text("INSERT INTO activity_checks VALUES (:id, '2026-10-03')"), {"id": front_id.hex})
            session.execute(text("INSERT INTO idempotency_requests VALUES (:key, 'create_front', NULL, :payload, :response, :now)"),
                            {"key": self.create_key.hex, "payload": '{"name":"Legacy","reference":null,"state":"open"}',
                             "response": self.response, "now": "2026-10-04 12:00:00"})
            session.execute(text("INSERT INTO idempotency_requests VALUES (:key, 'write_check', :target, :payload, :response, :now)"),
                            {"key": self.check_key.hex, "target": self.ids[0].hex,
                             "payload": '{"day":"yesterday","marked":true}',
                             "response": json.dumps({"front_id": str(self.ids[0]), "day": "2026-10-03", "marked": True}), "now": "2026-10-04 12:00:00"})
        with self.database.transaction() as session:
            self.before = {table: session.execute(text(f"SELECT * FROM {table}")).all()
                           for table in ("fronts", "activity_checks", "idempotency_requests")}

    def assert_preserved(self):
        with self.database.transaction() as session:
            for table, rows in self.before.items():
                columns = {"fronts": "id,name,reference,state,created_at,updated_at", "activity_checks": "front_id,day",
                           "idempotency_requests": "key,operation,target,payload,response,created_at"}[table]
                self.assertEqual(session.execute(text(f"SELECT {columns} FROM {table}")).all(), rows)
            self.assertEqual(session.execute(text("PRAGMA foreign_key_check")).all(), [])
            self.assertEqual(session.execute(text("SELECT count(*) FROM web_sessions")).scalar(), 0)
        self.assertTrue(self.database.schema_ready())
        command.check(migration_config(self.path))

    def test_current_legacy_code_imported_unchanged_and_owns_all_domain_replays(self):
        with self.database.transaction(write=True) as session:
            session.execute(text("INSERT INTO private_owner VALUES (1, :verifier, :now, :updated)"),
                            {"verifier": VERIFIER, "now": "2026-10-04 12:00:00", "updated": "2026-10-04 12:01:00"})
            session.execute(text("INSERT INTO web_sessions VALUES (:token, 1, :csrf, :now, :expires)"),
                            {"token": "c" * 64, "csrf": "D" * 43, "now": "2026-10-04 12:00:00", "expires": "2026-11-03 12:00:00"})
            session.execute(text("INSERT INTO login_throttle VALUES (1, :now, 7)"), {"now": "2026-10-04 12:00:00"})
        self.assertFalse(self.database.schema_ready())
        migrate(self.path)
        self.assert_preserved()
        with self.database.transaction() as session:
            account = session.execute(text("SELECT * FROM accounts")).mappings().one()
            account_id = UUID(account["id"])
            self.assertEqual(account["code_verifier"], VERIFIER)
            self.assertEqual(account["created_at"], str(self.before["fronts"][0][4]))
            self.assertEqual(account["legacy_updated_at"], "2026-10-04 12:01:00")
            for table in ("fronts", "idempotency_requests"):
                self.assertEqual(session.execute(text(f"SELECT DISTINCT account_id FROM {table}")).scalars().all(), [account_id.hex])
            self.assertEqual(session.execute(text("SELECT attempts FROM action_throttle WHERE action='login'")).scalar(), 7)
        auth = AuthService(self.database, clock=lambda: NOW)
        _, proof = auth.login(CODE)
        self.assertEqual(proof.account_id, account_id)
        operations = Operations(self.database, clock=lambda: NOW).with_account(account_id)
        self.assertEqual(operations.list_fronts(FrontQuery()).total, 3)
        self.assertEqual(operations.history(HistoryQuery(start="2026-10-03", end="2026-10-03")).total, 3)
        self.assertEqual(operations.create_front(FrontCreate(name="Legacy"), self.create_key).id, self.ids[0])
        self.assertEqual(operations.write_check(self.ids[0], CheckWrite(day="yesterday", marked=True), self.check_key).day.isoformat(), "2026-10-03")
        migrate(self.path)
        self.assert_preserved_after_login(account_id)
        with self.assertRaises(RuntimeError):
            command.downgrade(migration_config(self.path), "0002")
        self.assertTrue(self.database.schema_ready())

    def assert_preserved_after_login(self, account_id):
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT id FROM accounts")).scalar(), account_id.hex)
            self.assertEqual(session.execute(text("SELECT response FROM idempotency_requests WHERE key=:key"),
                                             {"key": self.create_key.hex}).scalar(), self.response)

    def test_failed_ownership_binding_rolls_back_all_0003_ddl_and_legacy_rows(self):
        with self.database.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TRIGGER refuse_binding BEFORE UPDATE ON fronts "
                                       "BEGIN SELECT RAISE(ABORT, 'synthetic migration failure'); END")
        with self.assertRaises(IntegrityError):
            migrate(self.path)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT version_num FROM alembic_version")).scalar(), "0002")
            self.assertEqual(session.execute(text("SELECT count(*) FROM sqlite_master WHERE name='accounts'")).scalar(), 0)
            self.assertNotIn("account_id", [row[1] for row in session.execute(text("PRAGMA table_info(fronts)"))])
            for table, rows in self.before.items():
                self.assertEqual(session.execute(text(f"SELECT * FROM {table}")).all(), rows)
            self.assertEqual(session.execute(text("PRAGMA foreign_key_check")).all(), [])

    def test_ownerless_legacy_stays_unclaimed_after_multiple_signups(self):
        migrate(self.path)
        self.assert_preserved()
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 0)
            for table in ("fronts", "idempotency_requests"):
                self.assertEqual(session.execute(text(f"SELECT DISTINCT account_id FROM {table}")).scalars().all(), [None])
        auth = AuthService(self.database, clock=lambda: NOW)
        for code in (CODE, NEW_CODE):
            with patch("activity_hub.auth.generate_access_code", return_value=code):
                signup = auth.signup()
            operations = Operations(self.database, clock=lambda: NOW).with_account(signup.account_id)
            self.assertEqual(operations.list_fronts(FrontQuery()).total, 0)
            self.assertEqual(operations.history(HistoryQuery(start="2026-10-03", end="2026-10-03")).total, 0)
            with self.assertRaises(DomainError) as caught:
                operations.write_check(self.ids[0], CheckWrite(day="yesterday", marked=True), self.check_key)
            self.assertEqual(caught.exception.status_code, 404)
            created = operations.create_front(FrontCreate(name="New"), self.create_key)
            self.assertNotIn(created.id, self.ids)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM fronts WHERE account_id IS NULL")).scalar(), 3)
            self.assertEqual(session.execute(text("SELECT count(*) FROM idempotency_requests WHERE account_id IS NULL")).scalar(), 2)


if __name__ == "__main__":
    unittest.main()
