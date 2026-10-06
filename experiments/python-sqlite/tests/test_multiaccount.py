"""Open signup and account isolation, using fictitious secrets and temporary DBs."""
import http.client
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import unittest
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

from sqlalchemy import text

from activity_hub.app import create_app
from activity_hub.contracts import FrontCreate, FrontQuery
from activity_hub.database import Database
from activity_hub.errors import DomainError
from activity_hub.operations import Operations
from tests.helpers import LoopbackServer, migrate

ORIGIN = "http://127.0.0.1:5173"
NOW = datetime(2026, 10, 4, 12, tzinfo=UTC)
CODE_A = "-".join(["AAAA"] * 8)
CODE_B = "-".join(["BBBB"] * 8)


class MultiaccountAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "multi.sqlite3"
        migrate(self.path)
        self.database = Database(self.path)
        self.addCleanup(self.database.dispose)
        self.now = NOW
        self.app = create_app(self.database, clock=lambda: self.now, web_origin=ORIGIN)

    def signup(self, server, code=CODE_A, headers=None):
        with patch("activity_hub.auth.generate_access_code", return_value=code):
            status, body, response_headers = server.request_with_headers(
                "POST", "/auth/signup", {}, {"Origin": ORIGIN, **(headers or {})})
        self.assertEqual(status, 201)
        self.assertEqual(set(body), {"account_id", "code"})
        self.assertEqual(body["code"], code)
        self.assertEqual(str(UUID(body["account_id"])), body["account_id"])
        self.assertNotIn("set-cookie", response_headers)
        self.assertEqual(response_headers["cache-control"], "no-store")
        return body["account_id"]

    def login(self, server, code=CODE_A, cookie=None):
        headers = {"Origin": ORIGIN}
        if cookie:
            headers["Cookie"] = cookie
        status, body, response_headers = server.request_with_headers("POST", "/auth/login", {"code": code}, headers)
        self.assertEqual(status, 200)
        self.assertEqual(set(body), {"authenticated", "account_id", "csrf_token", "expires_at"})
        cookie = SimpleCookie(response_headers["set-cookie"])["activity_hub_session"]
        return {"Cookie": "activity_hub_session=" + cookie.value, "Origin": ORIGIN,
                "X-CSRF-Token": body["csrf_token"], "X-Activity-Account": body["account_id"]}

    def test_public_signup_fixed_code_no_session_until_explicit_login(self):
        with LoopbackServer(self.app) as server:
            self.assertEqual(server.request("GET", "/auth/session"), (401, {"detail": "Authentication required"}))
            account = self.signup(server)
            self.assertEqual(server.request("GET", "/api/fronts")[0], 401)
            self.assertEqual(server.request("GET", "/auth/session")[0], 401)
            headers = self.login(server)
            self.assertEqual(headers["X-Activity-Account"], account)
            self.assertEqual(server.request("GET", "/api/fronts", headers=headers)[1]["total"], 0)
            self.assertEqual(server.request("POST", "/auth/signup", {}, headers),
                             (409, {"detail": "Sign out before creating an account"}))
            self.assertEqual(server.request("POST", "/auth/logout", headers=headers)[0], 204)
            self.assertEqual(server.request("GET", "/auth/session", headers=headers)[0], 401)
            self.assertEqual(self.login(server)["X-Activity-Account"], account)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 1)
            self.assertEqual(session.execute(text("SELECT count(*) FROM fronts")).scalar(), 0)
            stored = str(session.execute(text("SELECT * FROM accounts")).all())
            self.assertNotIn(CODE_A, stored)
            self.assertNotIn("A" * 32, stored)

    def test_cross_account_reads_writes_replays_and_stale_tab_before_parse(self):
        with LoopbackServer(self.app) as server:
            account_a = self.signup(server)
            account_b = self.signup(server, CODE_B)
            a = self.login(server)
            key = str(uuid4())
            status, front = server.request("POST", "/api/fronts", {"name": "Same"}, {**a, "Idempotency-Key": key})
            self.assertEqual(status, 201)
            path = "/api/fronts/" + front["id"]
            check_key = str(uuid4())
            check_body = {"day": "yesterday", "marked": True}
            self.assertEqual(server.request("PUT", path + "/check", check_body,
                                           {**a, "Idempotency-Key": check_key})[0], 200)
            other_device = self.login(server)
            b = self.login(server, CODE_B, a["Cookie"])
            self.assertEqual(b["X-Activity-Account"], account_b)
            self.assertEqual(server.request("GET", "/auth/session", headers=a)[0], 401)
            self.assertEqual(server.request("GET", "/auth/session", headers=other_device)[0], 200)
            for route in ("/api/fronts", "/api/history?start=2026-10-01&end=2026-10-04",
                          "/api/dashboard?start=2026-10-01&end=2026-10-04"):
                status, result = server.request("GET", route, headers=b)
                self.assertEqual(status, 200)
                self.assertEqual(result["total"], 0)
                self.assertEqual(result["items"], [])
            for method, route, body, request_key in (
                ("GET", path, None, None), ("PATCH", path, {"state": "archived"}, None),
                ("PUT", path + "/check", check_body, check_key),
                ("GET", "/api/history?start=2026-10-01&end=2026-10-04&front_id=" + front["id"], None, None),
                ("GET", "/api/dashboard?start=2026-10-01&end=2026-10-04&front_id=" + front["id"], None, None)):
                self.assertEqual(server.request(method, route, body, {**b, "Idempotency-Key": request_key or key}),
                                 (404, {"detail": "Front not found"}))
            # Same UUID request key in a different account is independent, not a replay/conflict.
            status, second = server.request("POST", "/api/fronts", {"name": "Same"}, {**b, "Idempotency-Key": key})
            self.assertEqual(status, 201)
            self.assertNotEqual(second["id"], front["id"])
            self.assertEqual(server.request("POST", "/api/fronts", {"name": "Same"},
                                           {**other_device, "Idempotency-Key": key}), (201, front))
            stale = {**b, "X-Activity-Account": account_a}
            for method, route in (("GET", "/api/fronts"), ("GET", "/api/history?start=invalid"),
                                  ("POST", "/api/fronts"), ("PATCH", path), ("PUT", path + "/check"),
                                  ("GET", "/api/dashboard?start=invalid"), ("POST", "/auth/logout")):
                self.assertEqual(server.request(method, route, headers={**stale, "Content-Type": "application/json"},
                                                raw_body=b'{"private-marker":'),
                                 (409, {"detail": "Account context changed"}))
            self.assertEqual(server.request("GET", "/auth/session", headers=b)[0], 200)
            self.assertEqual(server.request("GET", "/api/fronts", headers={"Cookie": b["Cookie"]}),
                             (409, {"detail": "Account context changed"}))
            self.assertEqual(server.request("GET", "/api/fronts", headers={**b, "X-Activity-Account": account_b.upper()}),
                             (409, {"detail": "Account context changed"}))

    def test_dashboard_activity_order_is_account_scoped_before_pagination_and_lookup(self):
        with LoopbackServer(self.app) as server:
            account_a = self.signup(server)
            account_b = self.signup(server, CODE_B)
            a, b = self.login(server), self.login(server, CODE_B)
            fronts = []
            for credentials, days in ((a, ()), (a, (1, 3)), (b, (1, 2, 3)), (b, ())):
                self.now += timedelta(seconds=1)
                status, front = server.request("POST", "/api/fronts", {"name": "Shared"},
                                               {**credentials, "Idempotency-Key": str(uuid4())})
                self.assertEqual(status, 201)
                fronts.append(front)
                for day in days:
                    self.assertEqual(server.request("PUT", "/api/fronts/" + front["id"] + "/check",
                                                    {"day": f"2026-01-0{day}", "marked": True},
                                                    {**credentials, "Idempotency-Key": str(uuid4())})[0], 200)
            window = "/api/dashboard?start=2026-01-01&end=2026-01-03"
            route = window + "&order=activity_desc&states=open&search=hare&limit=1"
            for credentials, expected, counts in ((a, (fronts[1], fronts[0]), (2, 0)),
                                                  (b, (fronts[2], fronts[3]), (3, 0))):
                for offset, (front, count) in enumerate(zip(expected, counts)):
                    status, page = server.request("GET", route + f"&offset={offset}", headers=credentials)
                    self.assertEqual(status, 200)
                    self.assertEqual((page["total"], page["limit"], page["offset"]), (2, 1, offset))
                    self.assertEqual([item["front"]["id"] for item in page["items"]], [front["id"]])
                    self.assertEqual(page["items"][0]["count"], count)
            for credentials, foreign in ((a, fronts[2]), (b, fronts[1])):
                self.assertEqual(server.request("GET", window + "&order=activity_desc&states=archived&front_id=" + foreign["id"],
                                                headers=credentials), (404, {"detail": "Front not found"}))
            self.assertEqual(server.request("GET", route), (401, {"detail": "Authentication required"}))
            self.assertEqual(server.request("GET", window + "&order=invalid",
                                            headers={**a, "X-Activity-Account": account_b}),
                             (409, {"detail": "Account context changed"}))
            self.assertEqual(a["X-Activity-Account"], account_a)
        self.assertIsNone(self.app.state.operations._account_id)

    def test_signup_origin_empty_object_bounds_and_persistent_independent_limits(self):
        with LoopbackServer(self.app) as server:
            for origin in (None, "null", ORIGIN + "/", "https://evil.test"):
                headers = {"Content-Type": "application/json"}
                if origin is not None:
                    headers["Origin"] = origin
                self.assertEqual(server.request("POST", "/auth/signup", headers=headers, raw_body=b'{"private-marker":'),
                                 (403, {"detail": "Request forbidden"}))
            cases = ((b'{"code":"private-marker"}', "application/json", 400),
                     (b'{"email":"private-marker"}', "application/json", 400),
                     (b'[]', "application/json", 400),
                     (b'{}', "text/plain", 415),
                     (b' ' * 1025, "application/json", 413))
            for body, content_type, expected in cases:
                status, result, headers = server.request_with_headers("POST", "/auth/signup", headers={
                    "Origin": ORIGIN, "Content-Type": content_type}, raw_body=body)
                self.assertEqual(status, expected)
                self.assertNotIn("private-marker", str(result))
                self.assertEqual(headers["cache-control"], "no-store")
                self.assertNotIn("set-cookie", headers)
            status, result, headers = server.request_with_headers("POST", "/auth/signup", {}, {"Origin": ORIGIN})
            self.assertEqual((status, result), (429, {"detail": "Too many signup attempts"}))
            self.assertEqual(headers["retry-after"], "60")
            # Signup throttling never disables login's independent action counter.
            self.assertEqual(server.request("POST", "/auth/login", {"code": CODE_A}, {"Origin": ORIGIN})[0], 401)
        other = Database(self.path)
        self.addCleanup(other.dispose)
        with LoopbackServer(create_app(other, clock=lambda: self.now, web_origin=ORIGIN)) as server:
            self.assertEqual(server.request("POST", "/auth/signup", {}, {"Origin": ORIGIN})[0], 429)
            self.now += timedelta(seconds=60)
            account = self.signup(server)
            self.login(server)
            with self.database.transaction() as session:
                counters = dict(session.execute(text("SELECT action, attempts FROM action_throttle")).all())
            self.assertEqual(counters, {"login": 1, "signup": 1})
            self.assertIsNotNone(account)

    def test_signup_concurrency_is_globally_bounded_and_no_success_resets_login(self):
        other = Database(self.path)
        self.addCleanup(other.dispose)
        with LoopbackServer(self.app) as first, LoopbackServer(create_app(other, clock=lambda: self.now)) as second:
            self.assertEqual(first.request("POST", "/auth/login", {"code": CODE_A}, {"Origin": ORIGIN})[0], 401)
            ready = threading.Barrier(8)
            def signup(index):
                ready.wait(timeout=5)
                return (first if index % 2 else second).request("POST", "/auth/signup", {}, {"Origin": ORIGIN})[0]
            codes = [symbol * 32 for symbol in "ABCDE"]
            with patch("activity_hub.auth.generate_access_code", side_effect=codes), ThreadPoolExecutor(max_workers=8) as executor:
                statuses = list(executor.map(signup, range(8)))
            self.assertEqual(statuses.count(201), 5)
            self.assertEqual(statuses.count(429), 3)
            self.login(first)
            with self.database.transaction() as session:
                self.assertEqual(dict(session.execute(text("SELECT action, attempts FROM action_throttle")).all()),
                                 {"login": 2, "signup": 5})
                self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 5)

    def test_valid_cookie_signup_rejected_before_parse_invalid_expired_cookie_allowed(self):
        with LoopbackServer(self.app) as server:
            self.signup(server)
            headers = self.login(server)
            with patch("activity_hub.auth.generate_access_code") as generate:
                self.assertEqual(server.request("POST", "/auth/signup", headers={**headers, "Content-Type": "application/json"},
                                                raw_body=b'{"private-marker":'),
                                 (409, {"detail": "Sign out before creating an account"}))
                generate.assert_not_called()
            self.signup(server, CODE_B, {"Cookie": "activity_hub_session=invalid"})
            self.now += timedelta(days=30)
            self.signup(server, "C" * 32, {"Cookie": headers["Cookie"]})
            with self.database.transaction() as session:
                self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 3)
                self.assertEqual(session.execute(text("SELECT count(*) FROM fronts")).scalar(), 0)
            self.assertEqual(server.request("GET", "/auth/session", headers=headers)[0], 401)

    def test_authenticated_signup_conflict_remains_409_when_public_limit_exhausted(self):
        with LoopbackServer(self.app) as server:
            self.signup(server)
            headers = self.login(server)
            for _ in range(6):
                self.assertEqual(server.request("POST", "/auth/signup", {}, headers),
                                 (409, {"detail": "Sign out before creating an account"}))
            self.assertEqual(server.request("GET", "/auth/session", headers=headers)[0], 200)
            with self.database.transaction() as session:
                self.assertEqual(session.execute(text("SELECT count(*) FROM accounts")).scalar(), 1)
                self.assertEqual(session.execute(text("SELECT attempts FROM action_throttle WHERE action='signup'")).scalar(), 5)

    def test_duplicate_account_header_and_cookie_authority_unknown_api_gate(self):
        with LoopbackServer(self.app) as server:
            account = self.signup(server)
            credentials = self.login(server)
            # Real duplicate header lines, rather than a dict or comma surrogate.
            for method, route in (("GET", "/api/fronts"), ("POST", "/api/fronts"), ("POST", "/auth/logout")):
                with closing(http.client.HTTPConnection("127.0.0.1", server.port, timeout=5)) as connection:
                    connection.putrequest(method, route)
                    for name, value in credentials.items():
                        connection.putheader(name, value)
                    connection.putheader("X-Activity-Account", account)
                    connection.putheader("Content-Type", "application/json")
                    connection.putheader("Content-Length", "1")
                    connection.endheaders(b'{')
                    response = connection.getresponse()
                    body = response.read()
                    self.assertEqual(response.status, 409)
                    self.assertIn(b'Account context changed', body)
                    self.assertEqual(response.getheader("Cache-Control"), "no-store")
            self.assertEqual(server.request("GET", "/api/fronts", headers={"X-Activity-Account": account})[0], 401)
            self.assertEqual(server.request("POST", "/api/unknown", headers={"Cookie": credentials["Cookie"]}, raw_body=b'{')[0], 409)
            self.assertEqual(server.request("GET", "/auth/session", headers={"Cookie": credentials["Cookie"]})[0], 200)
            self.assertEqual(server.request("GET", "/auth/session", headers=credentials)[0], 200)
            self.assertEqual(server.request("POST", "/api/fronts", {"name": "Denied", "account_id": account},
                                           {**credentials, "Idempotency-Key": str(uuid4())})[0], 422)
        self.assertIsNone(self.app.state.operations._account_id, "Requests must not mutate shared account scope")

    def test_same_check_key_separate_accounts_and_foreign_target_404_before_own_replay(self):
        with LoopbackServer(self.app) as server:
            self.signup(server)
            self.signup(server, CODE_B)
            a, b = self.login(server), self.login(server, CODE_B)
            create_key, check_key = str(uuid4()), str(uuid4())
            fronts = []
            checks = []
            for credentials in (a, b):
                status, front = server.request("POST", "/api/fronts", {"name": "Same", "state": "archived"},
                                               {**credentials, "Idempotency-Key": create_key})
                self.assertEqual(status, 201)
                fronts.append(front)
                status, check = server.request("PUT", "/api/fronts/" + front["id"] + "/check",
                                               {"day": "yesterday", "marked": True}, {**credentials, "Idempotency-Key": check_key})
                self.assertEqual(status, 200)
                checks.append(check)
                for route in ("/api/history?start=2026-10-03&end=2026-10-03",
                              "/api/dashboard?start=2026-10-03&end=2026-10-03"):
                    status, result = server.request("GET", route, headers=credentials)
                    self.assertEqual(status, 200)
                    self.assertEqual(result["total"], 1)
            self.assertNotEqual(checks[0]["front_id"], checks[1]["front_id"])
            for credentials, foreign in ((a, fronts[1]), (b, fronts[0])):
                self.assertEqual(server.request("PUT", "/api/fronts/" + foreign["id"] + "/check",
                                               {"day": "yesterday", "marked": True}, {**credentials, "Idempotency-Key": check_key}),
                                 (404, {"detail": "Front not found"}))

    def test_unscoped_operations_fail_closed_and_no_credential_mutation_service(self):
        operations = Operations(self.database, clock=lambda: NOW)
        for call in (lambda: operations.list_fronts(FrontQuery()),
                     lambda: operations.create_front(FrontCreate(name="Denied"), uuid4())):
            with self.assertRaises(DomainError) as caught:
                call()
            self.assertEqual(caught.exception.status_code, 401)
        self.assertFalse(hasattr(self.app.state.auth, "initialize_owner"))
        self.assertFalse(hasattr(self.app.state.auth, "rotate_code"))


if __name__ == "__main__":
    unittest.main()
