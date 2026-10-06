"""Disposable real Python HTTP server, same fictional rows as D1, no credentials in output."""
import json
import logging
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "experiments" / "python-sqlite"
sys.path.insert(0, str(ROOT))
from sqlalchemy import text
from activity_hub.app import create_app
from activity_hub.database import Database
from tests.helpers import LoopbackServer, create_account, migrate


def main():
    logging.disable(logging.CRITICAL)
    data = json.loads(sys.stdin.readline())
    with tempfile.TemporaryDirectory(prefix="activity-hub-measure-reference-") as directory:
        database = Database(Path(directory) / "reference.sqlite3")
        try:
            migrate(database.path)
            owners = {label: create_account(database, code=label * 32).hex for label in ("A", "B")}
            with database.transaction(write=True) as session:
                for row in data["fronts"]:
                    values = {k: v for k, v in row.items() if k != "owner"}
                    values["account_id"] = owners.get(row["owner"])
                    session.execute(text("INSERT INTO fronts(id,account_id,name,reference,state,created_at,updated_at) "
                                         "VALUES (:id,:account_id,:name,:reference,:state,:created_at,:updated_at)"), values)
                for row in data["checks"]:
                    session.execute(text("INSERT INTO activity_checks(front_id,day) VALUES (:front_id,:day)"), row)
            with LoopbackServer(create_app(database, web_origin="http://127.0.0.1:8787")) as server:
                print(json.dumps({"port": server.port}), flush=True)
                sys.stdin.readline()  # Parent closes only its own temporary server.
        finally:
            database.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Temporary reference failed", file=sys.stderr)
        sys.exit(1)
