import logging
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text

from activity_hub.access import require_private_access
from activity_hub.app import create_app
from activity_hub.contracts import FrontCreate
from activity_hub.database import Database
from activity_hub.operations import Operations
from tests.helpers import LoopbackServer, create_account, migrate

NOW = datetime(2026, 10, 3, 12, tzinfo=UTC)


def test_only_access():
    """Only test instances get this override. No token or runtime bypass exists."""
    return None


class _LogCapture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(self.format(record))


class HttpAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "db.sqlite3"
        migrate(self.path)
        self.database = Database(self.path)
        self.addCleanup(self.database.dispose)
        self.account_id = create_account(self.database, clock=lambda: NOW)
        self.app = create_app(self.database, clock=lambda: NOW)

    def authorized_app(self):
        app = create_app(self.database, clock=lambda: NOW)
        app.dependency_overrides[require_private_access] = test_only_access
        app.state.operations = app.state.operations.with_account(self.account_id)
        return app

    def create(self, server, name="Synthetic", key=None, **extra):
        return server.request("POST", "/api/fronts", {"name": name, **extra},
                              {"Idempotency-Key": str(key or uuid4())})

    def test_all_data_routes_deny_even_with_fabricated_credentials_before_existence_lookup(self):
        private = Operations(self.database, clock=lambda: NOW).with_account(self.account_id).create_front(FrontCreate(name="SecretSynthetic"), uuid4())
        with LoopbackServer(self.app) as server:
            status, schema = server.request("GET", "/openapi.json")
            self.assertEqual(status, 200)
            self.assertNotIn("SecretSynthetic", str(schema))
            routes = [(method.upper(), path) for path, methods in schema["paths"].items()
                      if path.startswith("/api/") for method in methods]
            self.assertEqual(len(routes), 7)
            for credentials in ({}, {"Cookie": "session=fabricated"}, {"Authorization": "Bearer fabricated"},
                                {"X-Dev-Auth": "allow", "Cookie": "session=fabricated", "Authorization": "Bearer fabricated"}):
                for identifier in (str(private.id), str(uuid4()), "not-an-id"):
                    for method, route in routes:
                        path = route.replace("{front_id}", identifier)
                        if route in ("/api/history", "/api/dashboard"):
                            path += "?start=2026-01-02&end=2026-01-01&front_id=" + identifier
                        body = {"name": "SecretSynthetic"} if method == "POST" else ({"state": "archived"} if method == "PATCH" else {"day": "today", "marked": True} if method == "PUT" else None)
                        status, response = server.request(method, path, body, credentials)
                        self.assertEqual(status, 401, (method, route, status))
                        self.assertEqual(response, {"detail": "Authentication required"})
            self.assertEqual(server.request("GET", "/health")[0], 200)
            self.assertEqual(server.request("GET", "/docs")[0], 200)
        self.assertEqual(Operations(self.database).with_account(self.account_id).get_front(private.id).state, "open")

    def test_authorized_test_only_full_crud_history_dashboard_stack(self):
        with LoopbackServer(self.authorized_app()) as server:
            key = uuid4()
            status, first = self.create(server, name="  Same  ", key=key, reference="https://example.test/material")
            self.assertEqual(status, 201)
            self.assertEqual(first["name"], "Same")
            self.assertEqual(first["state"], "open")
            self.assertTrue(first["created_at"].endswith("Z"))
            self.assertEqual(self.create(server, name="Same", key=key, reference="https://example.test/material"), (201, first))
            status, second = self.create(server, name="Same")
            self.assertEqual(status, 201)
            self.assertNotEqual(first["id"], second["id"])
            front_path = "/api/fronts/" + first["id"]
            status, front = server.request("GET", front_path)
            self.assertEqual((status, front), (200, first))
            status, edited = server.request("PATCH", front_path, {"state": "archived", "reference": None})
            self.assertEqual(status, 200)
            self.assertIsNone(edited["reference"])
            self.assertEqual(edited["name"], "Same")
            check_key = uuid4()
            headers = {"Idempotency-Key": str(check_key)}
            status, check = server.request("PUT", front_path + "/check", {"day": "yesterday", "marked": True}, headers)
            self.assertEqual(status, 200)
            self.assertEqual(check, {"front_id": first["id"], "day": "2026-10-02", "marked": True})
            self.assertEqual(server.request("PUT", front_path + "/check", {"day": "yesterday", "marked": True}, headers), (200, check))
            server.request("PUT", front_path + "/check", {"day": "2026-01-03", "marked": True}, {"Idempotency-Key": str(uuid4())})
            status, history = server.request("GET", "/api/history?start=2026-10-01&end=2026-10-03&front_id=" + first["id"])
            self.assertEqual(status, 200)
            self.assertEqual(history["total"], 1)
            self.assertEqual(history["items"], [check])
            status, dashboard = server.request("GET", "/api/dashboard?start=2026-01-01&end=2026-01-31")
            self.assertEqual(status, 200)
            items = {item["front"]["id"]: item for item in dashboard["items"]}
            self.assertEqual(items[first["id"]]["last_registered_day"], "2026-10-02")
            self.assertEqual(items[first["id"]]["count"], 1)
            self.assertEqual(items[first["id"]]["marked_dates"], ["2026-01-03"])
            self.assertEqual(items[second["id"]]["count"], 0)
            self.assertIsNone(items[second["id"]]["last_registered_day"])
            status, page = server.request("GET", "/api/fronts?states=archived&limit=1&search=am")
            self.assertEqual(status, 200)
            self.assertEqual(page["total"], 1)
            self.assertEqual(page["items"][0]["id"], first["id"])
            status, page = server.request("GET", "/api/fronts?states=open&states=archived&limit=1&offset=1")
            self.assertEqual(status, 200)
            self.assertEqual(page["total"], 2)
            self.assertEqual(len(page["items"]), 1)
            status, unmark = server.request("PUT", front_path + "/check", {"day": "yesterday", "marked": False}, {"Idempotency-Key": str(uuid4())})
            self.assertEqual(status, 200)
            self.assertFalse(unmark["marked"])
            self.assertEqual(server.request("GET", "/api/history?start=2026-10-02&end=2026-10-02&front_id=" + first["id"])[1]["items"], [])
            # Snapshot replay is not reapplied after that unmark or the earlier edit.
            self.assertEqual(server.request("PUT", front_path + "/check", {"day": "yesterday", "marked": True}, headers), (200, check))
            self.assertEqual(self.create(server, name="Same", key=key, reference="https://example.test/material"), (201, first))
            self.assertEqual(server.request("GET", front_path)[1]["state"], "archived")
            self.assertEqual(server.request("GET", "/api/history?start=2026-10-02&end=2026-10-02&front_id=" + first["id"])[1]["items"], [])

    def test_dashboard_activity_order_is_before_pagination_and_default_shape_is_unchanged(self):
        app = self.authorized_app()
        now = NOW
        app.state.operations.clock = lambda: now
        with LoopbackServer(app) as server:
            status, slow = self.create(server, name="More all-time activity")
            self.assertEqual(status, 201)
            now += timedelta(seconds=1)
            status, empty = self.create(server, name="Empty")
            self.assertEqual(status, 201)
            now += timedelta(seconds=1)
            status, fast = self.create(server, name="Later-created range winner")
            self.assertEqual(status, 201)
            for front, days in ((slow, ("2026-01-02", "2026-01-04", "2026-01-05", "2026-10-02")),
                                (fast, ("2026-01-01", "2026-01-03"))):
                for day in days:
                    status, _ = server.request("PUT", "/api/fronts/" + front["id"] + "/check",
                                               {"day": day, "marked": True}, {"Idempotency-Key": str(uuid4())})
                    self.assertEqual(status, 200)
            route = "/api/dashboard?start=2026-01-01&end=2026-01-03"
            expected = [fast, slow, empty]
            items = []
            for offset, front in enumerate(expected):
                status, page = server.request("GET", route + f"&order=activity_desc&limit=1&offset={offset}")
                self.assertEqual(status, 200)
                self.assertEqual(set(page), {"items", "total", "limit", "offset", "start", "end"})
                self.assertEqual((page["total"], page["limit"], page["offset"]), (3, 1, offset))
                self.assertEqual((page["start"], page["end"]), ("2026-01-01", "2026-01-03"))
                self.assertEqual(len(page["items"]), 1)
                item = page["items"][0]
                self.assertEqual(set(item), {"front", "marked_dates", "last_registered_day", "count"})
                self.assertEqual(item["front"], front)
                items.append(item)
            self.assertEqual([item["count"] for item in items], [2, 1, 0])
            self.assertEqual(items[0]["marked_dates"], ["2026-01-01", "2026-01-03"])
            self.assertEqual(items[1]["last_registered_day"], "2026-10-02")
            self.assertEqual(items[1]["marked_dates"], ["2026-01-02"])
            self.assertIsNone(items[2]["last_registered_day"])
            self.assertEqual(items[2]["marked_dates"], [])
            for order in ("", "&order=created"):
                status, page = server.request("GET", route + order)
                self.assertEqual(status, 200)
                self.assertEqual([item["front"]["id"] for item in page["items"]],
                                 [front["id"] for front in (slow, empty, fast)])
            status, page = server.request("GET", "/api/fronts")
            self.assertEqual(status, 200)
            self.assertEqual(set(page), {"items", "total", "limit", "offset"})
            self.assertEqual(page["items"], [slow, empty, fast])

    def test_dashboard_order_is_validated_over_http_and_only_in_dashboard_openapi(self):
        with LoopbackServer(self.authorized_app()) as server:
            route = "/api/dashboard?start=2026-01-01&end=2026-01-03&order="
            for order in ("created", "activity_desc"):
                self.assertEqual(server.request("GET", route + order)[0], 200)
                self.assertEqual(server.request("GET", "/api/fronts?order=" + order),
                                 (422, {"detail": "Invalid request"}))
            for order in ("", "CREATED", "activity_asc", "private-marker"):
                self.assertEqual(server.request("GET", route + order), (422, {"detail": "Invalid request"}))
            status, schema = server.request("GET", "/openapi.json")
            self.assertEqual(status, 200)
            dashboard_params = {param["name"]: param for param in schema["paths"]["/api/dashboard"]["get"]["parameters"]}
            self.assertEqual(dashboard_params["order"]["schema"]["enum"], ["created", "activity_desc"])
            self.assertEqual(dashboard_params["order"]["schema"]["default"], "created")
            front_params = {param["name"] for param in schema["paths"]["/api/fronts"]["get"]["parameters"]}
            self.assertNotIn("order", front_params)

    def test_uuid_request_keys_are_mandatory_and_payload_conflicts_are_409(self):
        with LoopbackServer(self.authorized_app()) as server:
            for headers in ({}, {"Idempotency-Key": "not-uuid"}):
                self.assertEqual(server.request("POST", "/api/fronts", {"name": "A"}, headers)[0], 422)
            key = uuid4()
            status, front = self.create(server, name="A", key=key)
            self.assertEqual(status, 201)
            self.assertEqual(self.create(server, name="B", key=key)[0], 409)
            check_path = "/api/fronts/" + front["id"] + "/check"
            for headers in ({}, {"Idempotency-Key": "not-uuid"}):
                self.assertEqual(server.request("PUT", check_path, {"day": "today", "marked": True}, headers)[0], 422)
            self.assertEqual(server.request("PUT", check_path, {"day": "today", "marked": True}, {"Idempotency-Key": str(key)})[0], 409)
            check_key = str(uuid4())
            self.assertEqual(server.request("PUT", check_path, {"day": "today", "marked": True}, {"Idempotency-Key": check_key})[0], 200)
            self.assertEqual(server.request("PUT", check_path, {"day": "today", "marked": False}, {"Idempotency-Key": check_key})[0], 409)

    def test_http_invalid_cases_are_422_without_echo_or_partial_data(self):
        with LoopbackServer(self.authorized_app()) as server:
            status, front = self.create(server)
            self.assertEqual(status, 201)
            check_path = "/api/fronts/" + front["id"] + "/check"
            cases = [
                ("POST", "/api/fronts", {"name": " "}),
                ("POST", "/api/fronts", {"name": "X", "reference": "javascript:private-marker"}),
                ("POST", "/api/fronts", {"name": "X", "state": "closed"}),
                ("POST", "/api/fronts", {"name": "X", "hours": 1}),
                ("PATCH", "/api/fronts/" + front["id"], {"name": None}),
                ("PUT", check_path, {"day": "today", "marked": 1}),
                ("PUT", check_path, {"day": "2026-10-04", "marked": True}),
                ("PUT", check_path, {"day": "2026-1-01", "marked": True}),
                ("GET", "/api/history?start=2026-01-02&end=2026-01-01", None),
                ("GET", "/api/history?start=2024-01-01&end=2025-01-01", None),
                ("GET", "/api/dashboard?start=today&end=today", None),
                ("GET", "/api/fronts?limit=101", None),
                ("GET", "/api/fronts?offset=-1", None),
                ("GET", "/api/fronts?states=closed", None),
                ("GET", "/api/fronts/not-an-id", None),
            ]
            for method, path, body in cases:
                with self.subTest(method=method, path=path):
                    status, response = server.request(method, path, body, {"Idempotency-Key": str(uuid4())})
                    self.assertEqual(status, 422)
                    self.assertNotIn("private-marker", str(response))
                    self.assertNotIn(str(self.path), str(response))
            self.assertEqual(server.request("POST", "/api/fronts", raw_body=b'{"name":"private-marker",', headers={"Content-Type": "application/json"})[0], 422)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM fronts")).scalar(), 1)
            self.assertEqual(session.execute(text("SELECT count(*) FROM activity_checks")).scalar(), 0)
            self.assertEqual(session.execute(text("SELECT count(*) FROM idempotency_requests")).scalar(), 1)

    def test_private_access_is_checked_before_parsing_json(self):
        async def async_denial():
            return require_private_access()

        async_app = create_app(self.database)
        async_app.dependency_overrides[require_private_access] = async_denial
        routes = [("POST", "/api/fronts"), ("PATCH", f"/api/fronts/{uuid4()}"),
                  ("PUT", f"/api/fronts/{uuid4()}/check")]
        for app, expected in ((self.app, 401), (async_app, 401), (self.authorized_app(), 422)):
            with LoopbackServer(app) as server:
                for method, route in routes:
                    with self.subTest(method=method, expected=expected):
                        status, response = server.request(
                            method, route, raw_body=b'{"name":"private-marker",',
                            headers={"Content-Type": "application/json"},
                        )
                        self.assertEqual(status, expected)
                        self.assertNotIn("private-marker", str(response))
                        if expected == 401:
                            self.assertEqual(response, {"detail": "Authentication required"})

    def test_nul_names_are_invalid_not_storage_failures(self):
        with LoopbackServer(self.authorized_app()) as server:
            status, front = self.create(server, name="Unchanged")
            self.assertEqual(status, 201)
            route = "/api/fronts/" + front["id"]
            for name in ("\x00", "A\x00B"):
                with self.subTest(name=repr(name)):
                    self.assertEqual(self.create(server, name=name)[0], 422)
                    self.assertEqual(server.request("PATCH", route, {"name": name})[0], 422)
            self.assertEqual(server.request("GET", route)[1]["name"], "Unchanged")
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM fronts")).scalar(), 1)
            self.assertEqual(session.execute(text("SELECT count(*) FROM idempotency_requests")).scalar(), 1)

    def test_missing_resource_ids_return_404_and_no_permanent_delete_route(self):
        missing = str(uuid4())
        with LoopbackServer(self.authorized_app()) as server:
            cases = [
                ("GET", "/api/fronts/" + missing, None),
                ("PATCH", "/api/fronts/" + missing, {"state": "archived"}),
                ("PUT", "/api/fronts/" + missing + "/check", {"day": "today", "marked": True}),
                ("GET", "/api/history?start=2026-01-01&end=2026-01-02&front_id=" + missing, None),
                ("GET", "/api/dashboard?start=2026-01-01&end=2026-01-02&front_id=" + missing, None),
            ]
            for method, path, body in cases:
                self.assertEqual(server.request(method, path, body, {"Idempotency-Key": str(uuid4())})[0], 404)
            schema = server.request("GET", "/openapi.json")[1]
            self.assertFalse(any("delete" in methods for methods in schema["paths"].values()))
            self.assertEqual(server.request("DELETE", "/api/fronts/" + missing)[0], 405)

    def test_health_checks_schema_and_unavailable_db_with_generic_503(self):
        no_schema = Database(Path(self.temp.name) / "empty.sqlite3")
        unavailable = Database(Path(self.temp.name) / "missing-parent" / "db.sqlite3")
        self.addCleanup(no_schema.dispose)
        self.addCleanup(unavailable.dispose)
        for database in (no_schema, unavailable):
            with LoopbackServer(create_app(database)) as server:
                status, response = server.request("GET", "/health")
                self.assertEqual((status, response), (503, {"detail": "Service unavailable"}))
                self.assertNotIn(str(database.path), str(response))
        with LoopbackServer(self.app) as server:
            self.assertEqual(server.request("GET", "/health"), (200, {"status": "ok"}))
            with self.database.engine.begin() as connection:
                connection.exec_driver_sql("DROP TABLE idempotency_requests")
            self.assertEqual(server.request("GET", "/health"), (503, {"detail": "Service unavailable"}))

    def test_storage_and_unexpected_errors_have_no_sensitive_response_or_log(self):
        capture = _LogCapture()
        logger = logging.getLogger()
        logger.addHandler(capture)
        self.addCleanup(logger.removeHandler, capture)
        app = self.authorized_app()
        with self.database.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TRIGGER reject_logs BEFORE INSERT ON idempotency_requests BEGIN SELECT RAISE(ABORT, 'private-marker'); END")
        with LoopbackServer(app) as server:
            status, response = self.create(server, name="private-marker", reference="https://private-marker.test/")
            self.assertEqual((status, response), (503, {"detail": "Service unavailable"}))
            with patch.object(app.state.operations, "list_fronts", side_effect=RuntimeError("private-marker")):
                self.assertEqual(server.request("GET", "/api/fronts"), (500, {"detail": "Internal server error"}))
        messages = "\n".join(capture.messages)
        for marker in ("private-marker", str(self.path), "INSERT INTO", "Traceback"):
            self.assertNotIn(marker, messages)
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM fronts")).scalar(), 0)

    def test_http_busy_exhaustion_is_503_without_partial_creation(self):
        short_timeout = Database(self.path, busy_timeout_ms=100)
        self.addCleanup(short_timeout.dispose)
        app = create_app(short_timeout)
        app.dependency_overrides[require_private_access] = test_only_access
        app.state.operations = app.state.operations.with_account(self.account_id)
        with LoopbackServer(app) as server, self.database.transaction(write=True):
            self.assertEqual(self.create(server, name="Private"), (503, {"detail": "Service unavailable"}))
        with self.database.transaction() as session:
            self.assertEqual(session.execute(text("SELECT count(*) FROM fronts")).scalar(), 0)
            self.assertEqual(session.execute(text("SELECT count(*) FROM idempotency_requests")).scalar(), 0)


if __name__ == "__main__":
    unittest.main()
