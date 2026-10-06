"""Authentication service/settings using only temporary DBs and fictitious codes."""
import hashlib
import os
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from alembic import command
from sqlalchemy import event, text

from activity_hub.auth import (
    AuthService, AuthSettings, CODE_ALPHABET, generate_access_code, normalize_access_code,
)
from activity_hub.contracts import CheckWrite, FrontCreate, FrontQuery
from activity_hub.database import Database
from activity_hub.errors import DomainError, StorageUnavailable
from activity_hub.operations import Operations
from tests.helpers import migrate, migration_config

CODE_A = "-".join(["AAAA"] * 8)
CODE_B = "-".join(["BBBB"] * 8)
NOW = datetime(2026, 10, 4, 12, tzinfo=UTC)


class AuthSettingsAcceptance(unittest.TestCase):
    def test_strict_origin_parser_canonicalization_and_cookie_names(self):
        for origin, canonical in (
            ("http://127.0.0.1:5173", "http://127.0.0.1:5173"),
            ("http://localhost:5174", "http://localhost:5174"),
            ("http://[::1]:5173", "http://[::1]:5173"),
            ("http://localhost:80", "http://localhost"),
            ("https://Activity.Example.test:443", "https://activity.example.test"),
            ("https://activity.example.test:8443", "https://activity.example.test:8443"),
            ("https://[2001:db8::1]", "https://[2001:db8::1]"),
        ):
            with self.subTest(origin=origin):
                settings = AuthSettings(origin)
                self.assertEqual(settings.web_origin, canonical)
                self.assertEqual(settings.secure_cookie, canonical.startswith("https:"))
                self.assertEqual(settings.cookie_name, "__Host-activity_hub_session" if settings.secure_cookie
                                 else "activity_hub_session")
        for origin in ("", "http://example.test", "http://127.1", "http://127.0.0.2", "http://0.0.0.0",
                       "http://[0:0:0:0:0:0:0:1]", "ftp://localhost", "//localhost", "http://localhost/",
                       "http://localhost/path", "http://localhost?", "http://localhost#", "http://localhost?q=x",
                       "https://user@host.test", "https://user:pass@host.test", "http://localhost:0",
                       "https://host.test:65536", "http://localhost:", "https://host.test,https://other.test",
                       "https://bad_host.test", "https://-host.test", " https://host.test", "https://host.test\n",
                       "https://host.test\t", "http://local\nhost", "https://[:::1]"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                AuthSettings(origin)

    def test_environment_default_and_no_development_auth_flags(self):
        with patch.dict(os.environ, {"ACTIVITY_HUB_WEB_ORIGIN": "https://private.example.test"}):
            self.assertEqual(AuthSettings.from_environment().web_origin, "https://private.example.test")
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(AuthSettings.from_environment().web_origin, "http://127.0.0.1:5173")
        with patch.dict(os.environ, {"ACTIVITY_HUB_WEB_ORIGIN": "http://public.example.test"}), self.assertRaises(ValueError):
            AuthSettings.from_environment()

    def test_generator_has_160_bits_and_normalization_is_bounded_ascii_only(self):
        self.assertEqual(len(CODE_ALPHABET), 32)
        self.assertEqual(len(set(CODE_ALPHABET)), 32)
        self.assertTrue(set("IO01").isdisjoint(CODE_ALPHABET))
        # Mock CSPRNG source: never generate/expose an administrative real code in tests.
        with patch("activity_hub.auth.secrets.choice", side_effect=list(CODE_ALPHABET)) as choice:
            code = generate_access_code()
        self.assertEqual(choice.call_count, 32)
        self.assertTrue(all(call.args == (CODE_ALPHABET,) for call in choice.call_args_list))
        self.assertEqual(len(code), 39)
        self.assertEqual(normalize_access_code(code), CODE_ALPHABET)
        self.assertEqual(normalize_access_code("  " + code.lower().replace("-", " - ") + "  "), CODE_ALPHABET)
        for invalid in (None, 1, "A" * 31, "A" * 33, "A" * 129, "I" * 32, "O" * 32,
                        "0" * 32, "1" * 32, "a" * 31 + "ß", "A" * 32 + "\n", "A" * 32 + "\t",
                        "A" * 32 + "\u00a0", "A" * 32 + "\x00"):
            self.assertIsNone(normalize_access_code(invalid))


class AuthAccountsAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "accounts.sqlite3"
        migrate(self.path)
        self.database = Database(self.path)
        self.addCleanup(self.database.dispose)
        self.now = NOW
        self.auth = AuthService(self.database, clock=lambda: self.now)

    def signup(self, code=CODE_A):
        with patch("activity_hub.auth.generate_access_code", return_value=code):
            return self.auth.signup()

    def login(self, code=CODE_A):
        self.auth.reserve_login_attempt()
        return self.auth.login(code)

    def test_signup_requires_current_schema_no_session_and_never_claims_existing_data(self):
        created = self.signup()
        with self.database.transaction() as session:
            row = session.execute(text("SELECT * FROM accounts")).mappings().one()
            self.assertEqual(row["id"], created.account_id.hex)
            self.assertEqual(row["code_verifier"], hashlib.sha256(
                b"activity-hub:access-code:v1:" + b"A" * 32).hexdigest())
            self.assertNotIn(CODE_A, str(row))
            self.assertNotIn("A" * 32, str(row))
            self.assertEqual(session.execute(text("SELECT count(*) FROM web_sessions")).scalar(), 0)
        self.assertNotEqual(self.signup(CODE_B).account_id, created.account_id)
        for path in (Path(self.temp.name) / "not-created.sqlite3",
                     Path(self.temp.name) / "missing-parent" / "not-created.sqlite3"):
            database = Database(path)
            self.addCleanup(database.dispose)
            with self.assertRaises(StorageUnavailable):
                AuthService(database).signup()
            self.assertFalse(path.exists())
        old_path = Path(self.temp.name) / "old.sqlite3"
        command.upgrade(migration_config(old_path), "0002")
        old = Database(old_path)
        self.addCleanup(old.dispose)
        for operation in (lambda: AuthService(old).signup(), lambda: AuthService(old).authenticate(None)):
            with self.assertRaises(StorageUnavailable):
                operation()
        with old.transaction() as session:
            self.assertEqual(session.execute(text("SELECT version_num FROM alembic_version")).scalar(), "0002")

    def test_code_verifier_is_immutable_even_with_valid_session_and_no_mutation_service(self):
        account = self.signup()
        token, proof = self.login()
        with self.database.transaction() as session:
            original = session.execute(text("SELECT code_verifier FROM accounts")).scalar()
        for verifier in ("b" * 64, original):
            with self.assertRaises(StorageUnavailable):
                with self.database.transaction(write=True) as session:
                    session.execute(text("UPDATE accounts SET code_verifier=:verifier WHERE id=:id"),
                                    {"verifier": verifier, "id": account.account_id.hex})
        self.assertEqual(self.auth.authenticate(token), proof)
        self.assertEqual(self.login()[1].account_id, account.account_id)
        self.assertFalse(hasattr(self.auth, "initialize_owner"))
        self.assertFalse(hasattr(self.auth, "rotate_code"))
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT code_verifier FROM accounts")).scalar(), original)

    def test_signup_collision_retries_before_commit_without_changing_existing_code(self):
        first = self.signup()
        with patch("activity_hub.auth.generate_access_code", side_effect=[CODE_A, CODE_B]) as generate:
            second = self.auth.signup()
        self.assertEqual(generate.call_count, 2)
        self.assertNotEqual(first.account_id, second.account_id)
        self.assertEqual(self.login()[1].account_id, first.account_id)
        self.assertEqual(self.login(CODE_B)[1].account_id, second.account_id)
        with patch("activity_hub.auth.generate_access_code", return_value=CODE_A), self.assertRaises(StorageUnavailable):
            self.auth.signup()
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 2)

    def test_signup_failure_rolls_back_empty_account_without_creating_session(self):
        with self.database.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TRIGGER refuse_account BEFORE INSERT ON accounts "
                                       "BEGIN SELECT RAISE(ABORT, 'private-marker'); END")
        with self.assertRaises(StorageUnavailable):
            self.signup()
        with self.database.transaction() as session:
            for table in ("accounts", "web_sessions", "fronts", "idempotency_requests"):
                self.assertEqual(session.execute(text(f"SELECT count(*) FROM {table}")).scalar(), 0)

    def test_concurrent_public_signup_has_independent_accounts_across_connections(self):
        other = Database(self.path)
        self.addCleanup(other.dispose)
        auths = [self.auth, AuthService(other, clock=lambda: self.now)]
        ready = threading.Barrier(2)
        def signup(index):
            ready.wait(timeout=5)
            auths[index].reserve_attempt("signup")
            return auths[index].signup().account_id
        with patch("activity_hub.auth.generate_access_code", side_effect=[CODE_A, CODE_B]), ThreadPoolExecutor(max_workers=2) as executor:
            ids = list(executor.map(signup, range(2)))
        self.assertEqual(len(set(ids)), 2)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 2)
            self.assertEqual(session.execute(text("SELECT count(*) FROM web_sessions")).scalar(), 0)
            self.assertEqual(session.execute(text("SELECT attempts FROM action_throttle WHERE action='signup'")).scalar(), 2)

    def test_read_authorization_snapshot_linearizes_before_logout_commit(self):
        account = self.signup()
        operations = Operations(self.database, clock=lambda: self.now).with_account(account.account_id)
        front = operations.create_front(FrontCreate(name="Snapshot"), uuid4())
        _, proof = self.login()
        other = Database(self.path)
        self.addCleanup(other.dispose)
        other_auth = AuthService(other, clock=lambda: self.now)
        authorized = threading.Event()
        release_reader = threading.Event()
        committing = threading.Event()
        @event.listens_for(other.engine, "commit")
        def before_physical_commit(connection):
            committing.set()
        def authorize(session):
            self.auth.authorize(session, proof)
            self.assertTrue(session.connection().connection.dbapi_connection.in_transaction)
            authorized.set()
            if not release_reader.wait(5):
                raise AssertionError("Reader was not released")
        operations = operations.with_account(account.account_id, authorize)
        with ThreadPoolExecutor(max_workers=2) as executor:
            reader = executor.submit(operations.list_fronts, FrontQuery())
            try:
                self.assertTrue(authorized.wait(5))
                logout = executor.submit(other_auth.logout, proof)
                self.assertTrue(committing.wait(5))
                self.assertFalse(logout.done())
            finally:
                release_reader.set()
            self.assertEqual(reader.result(timeout=5).items, [front])
            logout.result(timeout=5)
        with self.assertRaises(DomainError) as caught:
            operations.with_account(account.account_id, lambda session: self.auth.authorize(session, proof)).list_fronts(FrontQuery())
        self.assertEqual(caught.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
