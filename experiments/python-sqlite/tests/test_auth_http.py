"""Real HTTP without dependency overrides; all credentials/data are fictitious/temp."""
import hashlib
import logging
import os
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text

from activity_hub.app import create_app
from activity_hub.contracts import CheckWrite, FrontCreate, FrontPatch
from activity_hub.database import Database
from activity_hub.operations import Operations
from tests.helpers import LoopbackServer, create_account, migrate

ORIGIN = "http://127.0.0.1:5173"
COOKIE_NAME = "activity_hub_session"
# Deliberately predictable test-only code, never a real user's credential.
CODE = "A" * 32
WRONG_CODE = "B" * 32
NOW = datetime(2026, 10, 4, 12, tzinfo=UTC)


class AuthHttpAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "auth.sqlite3"
        migrate(self.path)
        self.database = Database(self.path)
        self.addCleanup(self.database.dispose)
        self.now = NOW
        self.environment = patch.dict(os.environ, {"ACTIVITY_HUB_WEB_ORIGIN": ORIGIN})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.app = create_app(self.database, clock=lambda: self.now)
        self.operations = Operations(self.database, clock=lambda: self.now)

    def configure(self):
        self.account_id = create_account(self.database, clock=lambda: self.now, code=CODE)
        self.operations = self.operations.with_account(self.account_id)

    def login(self, server, code=CODE, headers=None):
        return server.request_with_headers("POST", "/auth/login", {"code": code},
                                           {"Origin": ORIGIN, **(headers or {})})

    def session_headers(self, result, *, cookie_name=COOKIE_NAME):
        status, content, headers = result
        self.assertEqual(status, 200)
        self.assertEqual(set(content), {"authenticated", "account_id", "csrf_token", "expires_at"})
        self.assertIs(content["authenticated"], True)
        self.assertEqual(len(content["csrf_token"]), 43)
        self.assertEqual(datetime.fromisoformat(content["expires_at"]), self.now + timedelta(days=30))
        self.assertEqual(headers["cache-control"], "no-store")
        cookies = SimpleCookie()
        cookies.load(headers["set-cookie"])
        token = cookies[cookie_name].value
        self.assertEqual(len(token), 43)
        return {"Cookie": cookie_name + "=" + token, "Origin": ORIGIN,
                "X-CSRF-Token": content["csrf_token"], "X-Activity-Account": content["account_id"]}

    def domain_snapshot(self):
        with self.database.transaction() as session:
            return {table: session.execute(text(f"SELECT * FROM {table}")).all()
                    for table in ("fronts", "activity_checks", "idempotency_requests")}

    def test_zero_accounts_normal_and_missing_schema_fail_closed_no_reset_endpoints_or_cors(self):
        with LoopbackServer(self.app) as server:
            for method, route, body, headers, expected in (
                ("GET", "/auth/session", None, {}, (401, {"detail": "Authentication required"})),
                ("POST", "/auth/login", {"code": CODE}, {"Origin": ORIGIN}, (401, {"detail": "Authentication failed"})),
                ("POST", "/auth/logout", None, {"Origin": ORIGIN}, (401, {"detail": "Authentication required"})),
                ("GET", "/api/fronts", None, {}, (401, {"detail": "Authentication required"})),
            ):
                status, content, response_headers = server.request_with_headers(method, route, body, headers)
                self.assertEqual((status, content), expected)
                self.assertEqual(response_headers["cache-control"], "no-store")
            for route in ("/auth/init", "/auth/rotate", "/auth/reset", "/auth/recover", "/auth/reissue"):
                status, _, headers = server.request_with_headers("POST", route)
                self.assertEqual(status, 404)
                self.assertEqual(headers["cache-control"], "no-store")
            status, _, headers = server.request_with_headers("OPTIONS", "/auth/login", headers={
                "Origin": "https://evil.test", "Access-Control-Request-Method": "POST"})
            self.assertEqual(status, 405)
            self.assertNotIn("access-control-allow-origin", headers)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 0)
        empty = Database(Path(self.temp.name) / "empty.sqlite3")
        self.addCleanup(empty.dispose)
        with LoopbackServer(create_app(empty)) as server:
            for method, path, body in (("GET", "/auth/session", None),
                                      ("POST", "/auth/login", {"code": CODE}),
                                      ("POST", "/auth/signup", {}), ("GET", "/api/fronts", None)):
                status, body, headers = server.request_with_headers(method, path, body, {"Origin": ORIGIN})
                self.assertEqual((status, body), (503, {"detail": "Service unavailable"}))
                self.assertEqual(headers["cache-control"], "no-store")
        self.assertFalse(empty.path.exists(), "Readiness/auth probes must not create SQLite files")

    def test_cookie_login_normalization_and_only_verifiers_persist(self):
        self.configure()
        with LoopbackServer(self.app) as server:
            normalized_input = " " + "- ".join(["aaaa"] * 8) + " "
            result = self.login(server, normalized_input)
            credentials = self.session_headers(result)
            cookie = SimpleCookie(result[2]["set-cookie"])[COOKIE_NAME]
            self.assertTrue(cookie["httponly"])
            self.assertEqual(cookie["samesite"].lower(), "strict")
            self.assertEqual(cookie["path"], "/")
            self.assertEqual(cookie["max-age"], "2592000")
            self.assertFalse(cookie["secure"])
            self.assertEqual(cookie["domain"], "")
            self.assertEqual(server.request("GET", "/auth/session", headers=credentials), (200, result[1]))
            self.assertEqual(server.request("GET", "/api/fronts", headers=credentials)[0], 200)
            # The CSRF synchronizer is not an authentication credential.
            csrf_as_cookie = {"Cookie": COOKIE_NAME + "=" + credentials["X-CSRF-Token"]}
            self.assertEqual(server.request("GET", "/auth/session", headers=csrf_as_cookie),
                             (401, {"detail": "Authentication required"}))
        with self.database.transaction() as session:
            rows = session.execute(text("SELECT * FROM web_sessions")).mappings().all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["csrf_token"], credentials["X-CSRF-Token"])
            stored = str(session.execute(text("SELECT * FROM accounts")).all()) + str(rows)
            for raw_secret in (CODE, normalized_input, cookie.value):
                self.assertNotIn(raw_secret, stored)
            self.assertEqual(len(rows[0]["token_verifier"]), 64)

    def test_accounts_require_cookie_on_every_route_before_body_validation(self):
        self.configure()
        front = self.operations.create_front(FrontCreate(name="Private fixture"), uuid4())
        routes = [("GET", "/api/fronts"), ("POST", "/api/fronts"),
                  ("GET", "/api/fronts/" + str(front.id)), ("PATCH", "/api/fronts/not-an-id"),
                  ("PUT", "/api/fronts/not-an-id/check"), ("GET", "/api/history?start=invalid"),
                  ("GET", "/api/dashboard?start=invalid"), ("POST", "/auth/logout"),
                  ("GET", "/auth/session")]
        before = self.domain_snapshot()
        with LoopbackServer(self.app) as server:
            for headers in ({}, {"Authorization": "Bearer " + CODE},
                            {"X-Dev-Auth": "allow"}, {"Cookie": "session=fabricated"},
                            {"Cookie": COOKIE_NAME + "=fabricated"}):
                for method, route in routes:
                    status, content, response_headers = server.request_with_headers(
                        method, route, headers={"Content-Type": "application/json", **headers},
                        raw_body=b'{"private-marker":')
                    self.assertEqual((status, content), (401, {"detail": "Authentication required"}))
                    self.assertEqual(response_headers["cache-control"], "no-store")
        self.assertEqual(self.domain_snapshot(), before)

    def test_origin_and_csrf_deny_before_malformed_json_with_zero_mutations(self):
        self.configure()
        front = self.operations.create_front(FrontCreate(name="Untouched"), uuid4())
        before = self.domain_snapshot()
        with LoopbackServer(self.app) as server:
            credentials = self.session_headers(self.login(server))
            cases = [
                {key: value for key, value in credentials.items() if key != "Origin"},
                {**credentials, "Origin": "null"},
                {**credentials, "Origin": "https://evil.test"},
                {**credentials, "Origin": ORIGIN + "/"},
                {**credentials, "Origin": ORIGIN + ", https://evil.test"},
                {key: value for key, value in credentials.items() if key != "X-CSRF-Token"},
                {**credentials, "X-CSRF-Token": "wrong"},
                {**credentials, "X-CSRF-Token": "X" * 200},
            ]
            for method, route in (("POST", "/api/fronts"),
                                  ("PATCH", "/api/fronts/" + str(front.id)),
                                  ("PUT", "/api/fronts/" + str(front.id) + "/check"),
                                  ("POST", "/auth/logout")):
                for headers in cases:
                    result = server.request_with_headers(method, route, headers={
                        "Content-Type": "application/json", **headers}, raw_body=b'{"private-marker":')
                    self.assertEqual(result[:2], (403, {"detail": "Request forbidden"}))
                    self.assertEqual(result[2]["cache-control"], "no-store")
            # With valid security checks, JSON validation is reached and remains sanitized.
            self.assertEqual(server.request("POST", "/api/fronts", headers={
                "Content-Type": "application/json", **credentials}, raw_body=b'{"private-marker":'),
                (422, {"detail": "Invalid request"}))
            self.assertEqual(server.request("GET", "/auth/session", headers=credentials)[0], 200)
        self.assertEqual(self.domain_snapshot(), before)

    def test_login_origin_json_bounds_and_durable_invalid_attempts(self):
        self.configure()
        with LoopbackServer(self.app) as server:
            for origin in (None, "null", "https://evil.test", ORIGIN + "/", ORIGIN + ", " + ORIGIN):
                headers = {"Content-Type": "application/json"}
                if origin is not None:
                    headers["Origin"] = origin
                self.assertEqual(server.request("POST", "/auth/login", headers=headers,
                                                raw_body=b'{"code":"private-marker",'),
                                 (403, {"detail": "Request forbidden"}))
            attempts = [
                (b'{"code":"private-marker",', "application/json", 400),
                (b'{"code":null}', "application/json", 400),
                (b'{"code":123}', "application/json", 400),
                (b'{"code":"' + b"A" * 129 + b'"}', "application/json", 400),
                (b'{}', "application/json", 400),
                (b'code=private-marker', "application/x-www-form-urlencoded", 415),
                (b'{"code":"' + b"A" * 1100 + b'"}', "application/json", 413),
                (b'{"code":"' + b"B" * 32 + b'"}', "application/json", 401),
                (b'{"code":"' + b"B" * 32 + b'"}', "application/json", 401),
                (b'{"code":"' + b"B" * 32 + b'"}', "application/json", 401),
            ]
            for body, content_type, expected in attempts:
                status, content, headers = server.request_with_headers("POST", "/auth/login", headers={
                    "Origin": ORIGIN, "Content-Type": content_type}, raw_body=body)
                self.assertEqual(status, expected)
                self.assertNotIn("private-marker", str(content))
                self.assertEqual(headers["cache-control"], "no-store")
                self.assertNotIn("set-cookie", headers)
            status, content, headers = self.login(server)
            self.assertEqual((status, content), (429, {"detail": "Too many login attempts"}))
            self.assertEqual(headers["retry-after"], "60")
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT attempts FROM action_throttle")).scalar(), 10)
            self.assertEqual(session.execute(text("SELECT count(*) FROM action_throttle")).scalar(), 1)
            self.assertEqual(session.execute(text("SELECT count(*) FROM web_sessions")).scalar(), 0)
        reopened = Database(self.path)
        self.addCleanup(reopened.dispose)
        with LoopbackServer(create_app(reopened, clock=lambda: self.now)) as server:
            self.assertEqual(self.login(server)[0], 429)
            self.now += timedelta(seconds=60)
            self.session_headers(self.login(server))

    def test_login_attempt_concurrency_is_bounded_across_database_instances(self):
        self.configure()
        other = Database(self.path)
        self.addCleanup(other.dispose)
        with LoopbackServer(self.app) as first, LoopbackServer(create_app(other, clock=lambda: self.now)) as second:
            start = threading.Barrier(12)
            def attempt(index):
                start.wait(timeout=5)
                return self.login(first if index % 2 else second, WRONG_CODE)[0]
            with ThreadPoolExecutor(max_workers=12) as executor:
                statuses = list(executor.map(attempt, range(12)))
            self.assertEqual(statuses.count(401), 10)
            self.assertEqual(statuses.count(429), 2)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT attempts FROM action_throttle")).scalar(), 10)
            self.assertEqual(session.execute(text("SELECT count(*) FROM action_throttle")).scalar(), 1)

    def test_new_login_replaces_same_browser_only_logout_revokes_and_expired_pruned(self):
        self.configure()
        with LoopbackServer(self.app) as server:
            first = self.session_headers(self.login(server))
            second = self.session_headers(self.login(server))
            replaced = self.session_headers(self.login(server, headers={"Cookie": first["Cookie"]}))
            self.assertNotEqual(first["Cookie"], replaced["Cookie"])
            self.assertNotEqual(first["X-CSRF-Token"], replaced["X-CSRF-Token"])
            self.assertEqual(server.request("GET", "/auth/session", headers=first)[0], 401)
            self.assertEqual(server.request("GET", "/auth/session", headers=second)[0], 200)
            status, content, headers = server.request_with_headers("POST", "/auth/logout", headers=replaced)
            self.assertEqual((status, content), (204, b""))
            # A delayed deletion cookie would erase a newer login in another
            # tab. Revoke only the captured server session; never mutate the slot.
            self.assertNotIn("set-cookie", headers)
            self.assertEqual(headers["cache-control"], "no-store")
            self.assertEqual(server.request("GET", "/api/fronts", headers=replaced)[0], 401)
            self.now += timedelta(days=30)
            self.assertEqual(server.request("GET", "/auth/session", headers=second)[0], 401)
            self.assertEqual(server.request("POST", "/api/fronts", {"name": "Denied"}, second)[0], 401)
            self.session_headers(self.login(server))
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM web_sessions")).scalar(), 1)

    def test_session_survives_backend_restart_absolute_lifetime_does_not_slide(self):
        self.configure()
        with LoopbackServer(self.app) as server:
            result = self.login(server)
            credentials = self.session_headers(result)
        self.database.dispose()
        self.now += timedelta(days=29, hours=23)
        reopened = Database(self.path)
        self.addCleanup(reopened.dispose)
        with LoopbackServer(create_app(reopened, clock=lambda: self.now)) as server:
            self.assertEqual(server.request("GET", "/auth/session", headers=credentials), (200, result[1]))
            self.now += timedelta(hours=1)
            self.assertEqual(server.request("GET", "/auth/session", headers=credentials),
                             (401, {"detail": "Authentication required"}))

    def test_revocation_after_entry_gate_denies_all_transactional_operations_and_replays(self):
        self.configure()
        create_key, check_key = uuid4(), uuid4()
        front = self.operations.create_front(FrontCreate(name="Preserved"), create_key)
        self.operations.write_check(front.id, CheckWrite(day="yesterday", marked=True), check_key)
        before = self.domain_snapshot()
        authenticate = self.app.state.auth.authenticate
        def revoke_after_initial_gate(token):
            proof = authenticate(token)  # The initial read transaction has finished.
            with self.database.transaction(write=True) as session:
                session.execute(text("DELETE FROM web_sessions"))
            return proof
        routes = [
            ("POST", "/api/fronts", {"name": "Forbidden"}, uuid4()),
            ("GET", "/api/fronts", None, None),
            ("GET", "/api/fronts/" + str(front.id), None, None),
            ("PATCH", "/api/fronts/" + str(front.id), {"state": "archived"}, None),
            ("PUT", "/api/fronts/" + str(front.id) + "/check", {"day": "today", "marked": True}, uuid4()),
            ("GET", "/api/history?start=2026-10-01&end=2026-10-04", None, None),
            ("GET", "/api/dashboard?start=2026-10-01&end=2026-10-04", None, None),
            ("POST", "/api/fronts", {"name": "Preserved"}, create_key),
            ("PUT", "/api/fronts/" + str(front.id) + "/check", {"day": "yesterday", "marked": True}, check_key),
        ]
        with LoopbackServer(self.app) as server:
            for method, path, body, key in routes:
                with self.subTest(method=method, path=path, replay=key in (create_key, check_key)):
                    headers = self.session_headers(self.login(server))
                    if key is not None:
                        headers["Idempotency-Key"] = str(key)
                    with patch.object(self.app.state.auth, "authenticate", side_effect=revoke_after_initial_gate):
                        self.assertEqual(server.request(method, path, body, headers),
                                         (401, {"detail": "Authentication required"}))
        self.assertEqual(self.domain_snapshot(), before)

    def test_permanent_code_and_replays_survive_logout_login_and_other_account_creation(self):
        self.configure()
        with LoopbackServer(self.app) as server:
            first = self.session_headers(self.login(server))
            second = self.session_headers(self.login(server))
            create_key, check_key = uuid4(), uuid4()
            status, front = server.request("POST", "/api/fronts", {"name": "Keep"},
                                           {**first, "Idempotency-Key": str(create_key)})
            self.assertEqual(status, 201)
            path = "/api/fronts/" + front["id"]
            check_body = {"day": "yesterday", "marked": True}
            status, check = server.request("PUT", path + "/check", check_body,
                                           {**first, "Idempotency-Key": str(check_key)})
            self.assertEqual(status, 200)
            self.assertEqual(server.request("PATCH", path, {"state": "archived"}, first)[0], 200)
            self.assertEqual(server.request("PUT", path + "/check", {"day": "yesterday", "marked": False},
                                            {**first, "Idempotency-Key": str(uuid4())})[0], 200)
            before = self.domain_snapshot()
            for route in ("/auth/rotate", "/auth/reset", "/auth/recover", "/auth/reissue", "/auth/init"):
                self.assertEqual(server.request("POST", route, {"code": WRONG_CODE}, first)[0], 404)
            self.assertEqual(server.request("POST", "/auth/logout", headers=first)[0], 204)
            self.assertEqual(server.request("GET", "/auth/session", headers=first)[0], 401)
            self.assertEqual(server.request("GET", "/auth/session", headers=second)[0], 200)
            with patch("activity_hub.auth.generate_access_code", return_value=WRONG_CODE):
                self.assertEqual(server.request("POST", "/auth/signup", {}, {"Origin": ORIGIN})[0], 201)
            fresh = self.session_headers(self.login(server))
            self.assertEqual(server.request("POST", "/api/fronts", {"name": "Keep"},
                                           {**fresh, "Idempotency-Key": str(create_key)}), (201, front))
            self.assertEqual(server.request("PUT", path + "/check", check_body,
                                           {**fresh, "Idempotency-Key": str(check_key)}), (200, check))
            self.assertEqual(server.request("GET", path, headers=fresh)[1]["state"], "archived")
        self.assertEqual(self.domain_snapshot(), before)

    def test_logout_commits_after_gate_before_write_and_logout_transactions(self):
        self.configure()
        before = self.domain_snapshot()
        authenticate = self.app.state.auth.authenticate
        def logout_after_initial_gate(token):
            proof = authenticate(token)
            self.app.state.auth.logout(proof)
            return proof
        with LoopbackServer(self.app) as server:
            for method, route, body in (("POST", "/api/fronts", {"name": "Denied"}),
                                        ("POST", "/auth/logout", None)):
                headers = self.session_headers(self.login(server))
                headers["Idempotency-Key"] = str(uuid4())
                with patch.object(self.app.state.auth, "authenticate", side_effect=logout_after_initial_gate):
                    self.assertEqual(server.request(method, route, body, headers),
                                     (401, {"detail": "Authentication required"}))
        self.assertEqual(self.domain_snapshot(), before)

    def test_expiry_after_initial_gate_is_checked_again_inside_operation(self):
        self.configure()
        before = self.domain_snapshot()
        authenticate = self.app.state.auth.authenticate
        def expire_after_initial_gate(token):
            proof = authenticate(token)
            self.now += timedelta(days=30)
            return proof
        with LoopbackServer(self.app) as server:
            headers = self.session_headers(self.login(server))
            headers["Idempotency-Key"] = str(uuid4())
            with patch.object(self.app.state.auth, "authenticate", side_effect=expire_after_initial_gate):
                self.assertEqual(server.request("POST", "/api/fronts", {"name": "Denied"}, headers),
                                 (401, {"detail": "Authentication required"}))
        self.assertEqual(self.domain_snapshot(), before)

    def test_account_binding_change_after_gate_denies_operations_replays_and_logout(self):
        self.configure()
        other_account = create_account(self.database, clock=lambda: self.now, code=WRONG_CODE)
        key = uuid4()
        front = self.operations.create_front(FrontCreate(name="Binding"), key)
        before = self.domain_snapshot()
        authenticate = self.app.state.auth.authenticate
        def change_account_after_initial_gate(token):
            proof = authenticate(token)
            with self.database.transaction(write=True) as session:
                session.execute(text("UPDATE web_sessions SET account_id=:account WHERE token_verifier=:token"),
                                {"account": other_account.hex, "token": proof.token_verifier})
            return proof
        with LoopbackServer(self.app) as server:
            for method, route, body in (("GET", "/api/fronts", None),
                                        ("POST", "/api/fronts", {"name": "Binding"}),
                                        ("PATCH", "/api/fronts/" + str(front.id), {"state": "archived"}),
                                        ("POST", "/auth/logout", None)):
                headers = self.session_headers(self.login(server))
                headers["Idempotency-Key"] = str(key)
                with patch.object(self.app.state.auth, "authenticate", side_effect=change_account_after_initial_gate):
                    self.assertEqual(server.request(method, route, body, headers),
                                     (401, {"detail": "Authentication required"}))
        self.assertEqual(self.domain_snapshot(), before)

    def test_logout_expiry_after_gate_rechecks_in_its_transaction_without_clearing_cookie(self):
        self.configure()
        authenticate = self.app.state.auth.authenticate
        def expire_after_initial_gate(token):
            proof = authenticate(token)
            self.now += timedelta(days=30)
            return proof
        with LoopbackServer(self.app) as server:
            headers = self.session_headers(self.login(server))
            with patch.object(self.app.state.auth, "authenticate", side_effect=expire_after_initial_gate):
                status, result, response_headers = server.request_with_headers("POST", "/auth/logout", headers=headers)
            self.assertEqual((status, result), (401, {"detail": "Authentication required"}))
            self.assertNotIn("set-cookie", response_headers)
            self.assertEqual(response_headers["cache-control"], "no-store")

    def test_https_secure_host_cookie_and_configured_origin_not_forwarded_headers(self):
        self.configure()
        origin = "https://activity.example.test"
        app = create_app(self.database, clock=lambda: self.now, web_origin=origin)
        with LoopbackServer(app) as server:
            result = server.request_with_headers("POST", "/auth/login", {"code": CODE}, {"Origin": origin})
            credentials = self.session_headers(result, cookie_name="__Host-activity_hub_session")
            credentials["Origin"] = origin
            cookie = SimpleCookie(result[2]["set-cookie"])["__Host-activity_hub_session"]
            self.assertTrue(cookie["secure"])
            self.assertTrue(cookie["httponly"])
            self.assertEqual(cookie["domain"], "")
            headers = {**credentials, "Origin": ORIGIN, "X-Forwarded-Proto": "https",
                       "X-Forwarded-Host": "activity.example.test", "Idempotency-Key": str(uuid4())}
            self.assertEqual(server.request("POST", "/api/fronts", {"name": "Denied"}, headers)[0], 403)
            self.assertEqual(server.request("GET", "/api/fronts", headers=credentials)[0], 200)
            headers["Origin"] = origin
            self.assertEqual(server.request("POST", "/api/fronts", {"name": "Allowed"}, headers)[0], 201)


if __name__ == "__main__":
    unittest.main()
