"""Launcher checks: own subprocesses, loopback ports and temporary databases only."""
import contextlib
import http.client
import io
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import dev
from tests.helpers import ROOT, migrate


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def ports():
    first = free_port()
    second = free_port()
    while first == second:
        second = free_port()
    return {"ACTIVITY_HUB_API_PORT": str(first), "ACTIVITY_HUB_WEB_PORT": str(second)}


def get(port, path):
    with contextlib.closing(http.client.HTTPConnection("127.0.0.1", port, timeout=1)) as connection:
        connection.request("GET", path)
        response = connection.getresponse()
        return response.status, response.read()


class LauncherAcceptance(unittest.TestCase):
    def test_invalid_ports_fail_before_starting_anything(self):
        for value in ("0", "-1", "65536", "text", "1.5", ""):
            with self.subTest(value=value), patch.dict(os.environ, {**ports(), "ACTIVITY_HUB_API_PORT": value}), \
                    patch.object(dev.subprocess, "Popen") as launch, contextlib.redirect_stderr(io.StringIO()) as errors:
                self.assertEqual(dev.main(), 2)
                launch.assert_not_called()
                self.assertIn("ACTIVITY_HUB_API_PORT", errors.getvalue())

    def test_busy_port_is_not_reused_and_its_owner_is_not_stopped(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            values = {**ports(), "ACTIVITY_HUB_API_PORT": str(listener.getsockname()[1])}
            with patch.dict(os.environ, values), patch.object(dev.subprocess, "Popen") as launch, \
                    contextlib.redirect_stderr(io.StringIO()) as errors:
                self.assertEqual(dev.main(), 2)
                launch.assert_not_called()
                self.assertIn("ocupado", errors.getvalue())
            with socket.create_connection(listener.getsockname(), timeout=1):
                pass  # The pre-existing listener still accepts connections.

    def test_missing_node_reports_the_requirement_without_installing(self):
        with patch.dict(os.environ, ports()), patch.object(dev.shutil, "which", return_value=None), \
                patch.object(dev.subprocess, "Popen") as launch, contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(dev.main(), 2)
            launch.assert_not_called()
            self.assertIn("Node", errors.getvalue())

    def test_one_child_failing_stops_the_other_and_returns_failure(self):
        real_popen = subprocess.Popen
        children = []
        def launch(*args, **kwargs):
            code = "import time; time.sleep(0.3); raise SystemExit(7)" if not children else "import time; time.sleep(60)"
            child = real_popen([sys.executable, "-c", code], start_new_session=True)
            children.append(child)
            return child
        try:
            with patch.dict(os.environ, ports()), patch.object(dev.subprocess, "Popen", side_effect=launch), \
                    contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(dev.main(), 7)
            self.assertEqual(len(children), 2)
            self.assertTrue(all(child.poll() is not None for child in children))
        finally:
            for child in children:
                if child.poll() is None:
                    child.kill()
                child.wait()

    def exercise_real_launcher(self, stop_signal, initialize, authenticate=False):
        with tempfile.TemporaryDirectory(prefix="activity-launcher-") as temporary, tempfile.TemporaryFile() as log:
            database = Path(temporary) / "isolated data" / "activity.sqlite3"
            if initialize:
                migrate(database)
            values = ports()
            api_port, web_port = (int(values[key]) for key in ("ACTIVITY_HUB_API_PORT", "ACTIVITY_HUB_WEB_PORT"))
            # Supply only the runtime path and this test's own configuration.
            env = {"PATH": str(Path(sys.executable).parent) + os.pathsep + os.defpath + ":/opt/homebrew/bin",
                   "ACTIVITY_HUB_DB_PATH": str(database), **values}
            process = subprocess.Popen([str(ROOT / "dev.py")], cwd=temporary,
                                       env=env, stdout=log, stderr=log, start_new_session=True)
            try:
                deadline = time.monotonic() + 20
                while True:
                    if process.poll() is not None:
                        log.seek(0)
                        self.fail(f"Launcher exited before serving: {log.read().decode()}")
                    try:
                        status, body = get(web_port, "/api/fronts")
                        expected = b"Authentication required" if initialize else b"Service unavailable"
                        if status == (401 if initialize else 503) and expected in body:
                            break
                    except (OSError, http.client.HTTPException):
                        pass
                    self.assertLess(time.monotonic(), deadline, "Launcher did not serve through the frontend proxy")
                    time.sleep(0.1)
                self.assertEqual(get(web_port, "/")[0], 200)
                self.assertEqual(get(web_port, "/auth/session")[0], 401 if initialize else 503)
                if initialize:
                    self.assertEqual(get(web_port, "/health"), (200, b'{"status":"ok"}'))
                    if authenticate:
                        self.assertEqual(get(web_port, "/auth/session")[0], 401)
                        with contextlib.closing(http.client.HTTPConnection("127.0.0.1", web_port, timeout=3)) as connection:
                            origin_headers = {"Origin": f"http://127.0.0.1:{web_port}", "Content-Type": "application/json"}
                            connection.request("POST", "/auth/signup", "{}", origin_headers)
                            response = connection.getresponse()
                            signup = json.loads(response.read())
                            self.assertEqual(response.status, 201, "Real signup must be proxied on the custom origin")
                            self.assertIsNone(response.getheader("Set-Cookie"))
                            self.assertEqual(get(web_port, "/auth/session")[0], 401)
                            connection.request("POST", "/auth/login", json.dumps({"code": signup["code"]}), origin_headers)
                            response = connection.getresponse()
                            logged_in = json.loads(response.read())
                            self.assertEqual(response.status, 200, "Launcher must configure the exact frontend origin")
                            self.assertEqual(logged_in["account_id"], signup["account_id"])
                            cookie = response.getheader("Set-Cookie").split(";", 1)[0]
                            connection.request("GET", "/api/fronts", headers={
                                "Cookie": cookie, "X-Activity-Account": signup["account_id"]})
                            response = connection.getresponse()
                            self.assertEqual(response.status, 200)
                            self.assertEqual(json.loads(response.read())["total"], 0)
                else:
                    self.assertFalse(database.parent.exists(), "Launcher must not create/migrate a database")
                process.send_signal(stop_signal)
                self.assertEqual(process.wait(timeout=12), 128 + stop_signal)
                for port in (api_port, web_port):
                    with self.assertRaises(OSError):
                        socket.create_connection(("127.0.0.1", port), timeout=0.5)
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=12)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()

    def test_real_servers_proxy_and_ctrl_c_from_another_directory(self):
        self.exercise_real_launcher(signal.SIGINT, initialize=True)

    def test_custom_port_origin_supports_real_signup_login_and_account_proxy(self):
        self.exercise_real_launcher(signal.SIGTERM, initialize=True, authenticate=True)

    def test_sigterm_cleanup_without_automatic_database_creation(self):
        self.exercise_real_launcher(signal.SIGTERM, initialize=False)
