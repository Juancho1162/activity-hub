"""Removed administrative credential paths are inert, even with TTY/arguments."""
import ast
import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from activity_hub import admin
from tests.helpers import ROOT


class AdminCliAcceptance(unittest.TestCase):
    def test_stub_refuses_every_command_and_never_uses_database_or_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "uncreated" / "admin.sqlite3"
            for arguments in ([], ["init"], ["rotate"], ["reset"], ["--help"],
                              ["--db-path", str(path), "init"], ["rotate", "--code", "fictitious-marker"]):
                stdout, stderr = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr), \
                        patch("builtins.input", side_effect=AssertionError("No credential prompt permitted")):
                    status = admin.main(arguments)
                self.assertNotEqual(status, 0)
                output = stdout.getvalue() + stderr.getvalue()
                self.assertIn("web signup", output)
                self.assertIn("permanent", output)
                self.assertIn("no reset or recovery", output)
                self.assertNotIn("fictitious-marker", output)
                self.assertNotIn(str(path), output)
            self.assertFalse(path.parent.exists())

    def test_module_subprocess_remains_nonoperative_with_explicit_temporary_environment(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "uncreated" / "admin.sqlite3"
            for command in ("init", "rotate", "--help"):
                result = subprocess.run([sys.executable, "-m", "activity_hub.admin", command],
                                        cwd=ROOT, env={"ACTIVITY_HUB_DB_PATH": str(path)},
                                        capture_output=True, text=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("web signup", result.stderr)
                self.assertNotIn("Traceback", result.stderr)
            self.assertFalse(path.parent.exists())

    def test_stub_imports_no_database_auth_or_argument_parser(self):
        tree = ast.parse(Path(admin.__file__).read_text())
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imports.append(node.module)
        self.assertEqual(imports, ["sys"])


if __name__ == "__main__":
    unittest.main()
