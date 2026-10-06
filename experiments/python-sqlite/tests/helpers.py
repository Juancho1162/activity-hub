"""Temporary migrated databases and real loopback HTTP; never a runtime entrypoint."""
import http.client
import json
import socket
import threading
from contextlib import closing
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[1]


def migration_config(path):
    config = Config(str(ROOT / "alembic.ini"))
    config.attributes["database_path"] = Path(path)
    return config


def migrate(path):
    command.upgrade(migration_config(path), "head")


class _ReadyServer(uvicorn.Server):
    def __init__(self, config, ready):
        super().__init__(config)
        self.ready = ready

    async def startup(self, sockets=None):
        await super().startup(sockets=sockets)
        self.ready.set()


class LoopbackServer:
    def __init__(self, app):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.bind(("127.0.0.1", 0))
        self.port = self.socket.getsockname()[1]
        self.ready = threading.Event()
        self.errors = []
        config = uvicorn.Config(
            app, host="127.0.0.1", port=0, access_log=False,
            log_config=None, lifespan="on", timeout_graceful_shutdown=2,
        )
        self.server = _ReadyServer(config, self.ready)
        self.thread = threading.Thread(target=self._run, name="test-uvicorn", daemon=True)

    def _run(self):
        try:
            self.server.run(sockets=[self.socket])
        except BaseException as error:
            self.errors.append(error)
            self.ready.set()

    def __enter__(self):
        self.thread.start()
        if not self.ready.wait(5) or not self.server.started or self.errors:
            self.__exit__(None, None, None)
            raise AssertionError("Loopback Uvicorn did not become ready")
        return self

    def __exit__(self, *args):
        self.server.should_exit = True
        self.thread.join(5)
        if self.thread.is_alive():
            self.server.force_exit = True
            self.thread.join(5)
        self.socket.close()
        if self.thread.is_alive() or self.errors:
            raise AssertionError("Loopback Uvicorn did not stop cleanly")

    def request(self, method, path, body=None, headers=None, raw_body=None):
        status, content, _ = self.request_with_headers(method, path, body, headers, raw_body)
        return status, content

    def request_with_headers(self, method, path, body=None, headers=None, raw_body=None):
        headers = dict(headers or {})
        if body is not None:
            raw_body = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        with closing(http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)) as connection:
            connection.request(method, path, body=raw_body, headers=headers)
            response = connection.getresponse()
            content = response.read()
            if "application/json" in response.getheader("content-type", ""):
                content = json.loads(content)
            return response.status, content, {key.lower(): value for key, value in response.getheaders()}


def create_account(database, *, clock=None, code="A" * 32):
    """An isolated service fixture, using a deliberately fictitious generated code."""
    from unittest.mock import patch
    from activity_hub.auth import AuthService
    with patch("activity_hub.auth.generate_access_code", return_value=code):
        return AuthService(database, clock=clock).signup().account_id
