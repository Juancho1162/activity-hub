"""Differential oracle: installed Python reference, disposable DBs, fictitious input only."""
import http.client
import json
import logging
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[2] / "experiments" / "python-sqlite"
sys.path.insert(0, str(ROOT))

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import text

from activity_hub.app import create_app
from activity_hub.auth import AuthService
from activity_hub.contracts import AccessCodeLogin, CheckWrite, FrontCreate, FrontPatch, SignupRequest
from activity_hub.database import Database
from activity_hub.models import Account
from activity_hub.operations import Operations
from tests.helpers import LoopbackServer, create_account, migrate

ORIGIN = "http://127.0.0.1:8787"
NOW = datetime(2026, 10, 3, 21, 59, tzinfo=UTC)
TABLES = ("accounts", "web_sessions", "fronts", "activity_checks", "idempotency_requests")


def counts(database):
    with database.transaction() as session:
        return [session.execute(text(f"SELECT count(*) FROM {table}")).scalar() for table in TABLES]


def validation(cases):
    models = {"create": FrontCreate, "patch": FrontPatch, "check": CheckWrite,
              "login": AccessCodeLogin, "signup": SignupRequest}
    results = []
    for case in cases:
        try:
            if case["kind"] == "uuid":
                results.append({"valid": True, "value": TypeAdapter(UUID).validate_python(case["value"]).hex})
            else:
                data = models[case["kind"]].model_validate(case["value"])
                value = data.model_dump(mode="json", exclude_unset=case["kind"] == "patch")
                results.append({"valid": True, "value": value,
                                "payload": json.dumps(value, sort_keys=True, separators=(",", ":"))})
        except (ValidationError, ValueError):
            results.append({"valid": False})
    return results


def media(database, cases):
    create_account(database, clock=lambda: NOW, code="A" * 32)
    auth = AuthService(database, clock=lambda: NOW)
    token, proof = auth.login("A" * 32)
    results = []
    with LoopbackServer(create_app(database, clock=lambda: NOW, web_origin=ORIGIN)) as server:
        for case in cases:
            with database.transaction(write=True) as session:
                session.execute(text("DELETE FROM action_throttle"))
            before = counts(database)
            connection = http.client.HTTPConnection("127.0.0.1", server.port, timeout=5)
            body = json.dumps(case["body"]).encode()
            try:
                connection.putrequest("POST", case["route"])
                connection.putheader("Origin", ORIGIN)
                if case["route"].startswith("/api/"):
                    connection.putheader("Cookie", "activity_hub_session=" + token)
                    connection.putheader("X-Activity-Account", str(proof.account_id))
                    connection.putheader("X-CSRF-Token", proof.csrf_token)
                    connection.putheader("Idempotency-Key", "b" * 32)
                for value in case["types"]:
                    connection.putheader("Content-Type", value)
                connection.putheader("Content-Length", str(len(body)))
                connection.endheaders(body)
                response = connection.getresponse()
                response.read()  # Never return generated codes/cookies/session values.
                after = counts(database)
                with database.transaction() as session:
                    attempts = dict(session.execute(text("SELECT action,attempts FROM action_throttle")).all())
                results.append({"status": response.status, "changes": [a - b for a, b in zip(after, before)],
                                "attempts": attempts, "no_store": response.getheader("cache-control") == "no-store"})
            finally:
                connection.close()
    return results


def replays(database, account_id):
    with database.transaction(write=True) as session:
        session.add(Account(id=UUID(account_id), code_verifier="f" * 64, created_at=NOW))
    operations = Operations(database, clock=lambda: NOW).with_account(UUID(account_id))
    body = {"name": "  Guitarra 🎸 / café \u001f ", "reference": "HTTPS://bücher.example:443/mañana?q=🎸"}
    create_key = UUID("a" * 32)
    check_key = UUID("b" * 32)
    front = operations.create_front(FrontCreate(**body), create_key)
    check = operations.write_check(front.id, CheckWrite(day="today", marked=True), check_key)
    operations.patch_front(front.id, FrontPatch(name="Editado después", state="archived", reference=None))
    operations.write_check(front.id, CheckWrite(day=check.day.isoformat(), marked=False), UUID("c" * 32))
    with database.transaction() as session:
        fronts = [dict(row) for row in session.execute(text("SELECT * FROM fronts")).mappings()]
        records = [dict(row) for row in session.execute(text("SELECT * FROM idempotency_requests ORDER BY key")).mappings()]
    return {"body": body, "fronts": fronts, "records": records,
            "create": front.model_dump(mode="json"), "check": check.model_dump(mode="json")}


def queries(database, command):
    owners = {label: create_account(database, clock=lambda: NOW, code=label * 32).hex for label in ("A", "B")}
    with database.transaction(write=True) as session:
        for row in command["fronts"]:
            values = {key: value for key, value in row.items() if key != "owner"}
            values["account_id"] = owners.get(row["owner"])
            session.execute(text("INSERT INTO fronts(id,account_id,name,reference,state,created_at,updated_at) "
                                 "VALUES (:id,:account_id,:name,:reference,:state,:created_at,:updated_at)"), values)
        for row in command["checks"]:
            session.execute(text("INSERT INTO activity_checks(front_id,day) VALUES (:front_id,:day)"), row)
    token, proof = AuthService(database, clock=lambda: NOW).login("A" * 32)
    headers = {"Cookie": "activity_hub_session=" + token, "X-Activity-Account": str(proof.account_id)}
    with LoopbackServer(create_app(database, clock=lambda: NOW, web_origin=ORIGIN)) as server:
        return [{"status": status, "value": value}
                for status, value in (server.request("GET", route, headers=headers) for route in command["cases"])]


def main():
    logging.disable(logging.CRITICAL)
    command = json.load(sys.stdin)
    if command["action"] == "validate":
        return validation(command["cases"])
    with tempfile.TemporaryDirectory(prefix="activity-hub-js-reference-") as directory:
        database = Database(Path(directory) / "reference.sqlite3")
        try:
            migrate(database.path)
            if command["action"] == "media":
                return media(database, command["cases"])
            if command["action"] == "replays":
                return replays(database, command["account_id"])
            if command["action"] == "queries":
                return queries(database, command)
            raise ValueError("Unknown reference action")
        finally:
            database.dispose()


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=True))
