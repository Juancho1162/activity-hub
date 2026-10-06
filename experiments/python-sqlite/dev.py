#!/usr/bin/env python3
"""Run both local servers; no installs, migrations, database access or auth changes."""
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[1]


def port_from_env(name, default):
    value = os.environ.get(name, str(default))
    if not value.isascii() or not value.isdigit() or len(value) > 5 or not 1 <= int(value) <= 65535:
        raise ValueError(f"{name} debe ser un puerto entero entre 1 y 65535.")
    return int(value)


def stop_children(children):
    # Direct Uvicorn/Node children, not npm/shell wrappers or process-name searches.
    for _, child in children:
        child.terminate()
    deadline = time.monotonic() + 5
    for _, child in children:
        try:
            child.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()


def main():
    try:
        if os.name != "posix":
            raise ValueError("Este lanzador requiere POSIX; está probado en macOS.")
        api_port = port_from_env("ACTIVITY_HUB_API_PORT", 8000)
        web_port = port_from_env("ACTIVITY_HUB_WEB_PORT", 5173)
        if api_port == web_port:
            raise ValueError("Backend y frontend necesitan puertos distintos.")
        python = WORKSPACE / ".venv/bin/python"
        vite = WORKSPACE / "frontend/node_modules/vite/bin/vite.js"
        if not os.access(python, os.X_OK):
            raise ValueError("Falta .venv/bin/python. Prepara el backend siguiendo README.md.")
        node = shutil.which("node")
        if not node:
            raise ValueError("Falta Node en PATH; este proyecto usa Node 26.")
        if not vite.is_file():
            raise ValueError("Faltan dependencias del frontend. Ejecuta npm --prefix frontend ci --ignore-scripts.")
        for port in (api_port, web_port):
            with socket.socket() as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    sock.bind(("127.0.0.1", port))
                except OSError:
                    raise ValueError(f"El puerto {port} está ocupado o no está disponible. No se ha detenido su proceso.") from None
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2

    child_env = {**os.environ, "ACTIVITY_HUB_WEB_ORIGIN": f"http://127.0.0.1:{web_port}", "ACTIVITY_HUB_API_PORT": str(api_port)}
    commands = [
        ("Backend", [str(python), "-m", "uvicorn", "activity_hub.app:app", "--host", "127.0.0.1",
                     "--port", str(api_port), "--no-access-log", "--timeout-graceful-shutdown", "5"], ROOT),
        ("Frontend", [node, str(vite), "--host", "127.0.0.1", "--port", str(web_port),
                      "--strictPort", "--clearScreen", "false"], WORKSPACE / "frontend"),
    ]
    stop_signal = 0
    def request_stop(number, _frame):
        nonlocal stop_signal
        stop_signal = number

    previous = {number: signal.signal(number, request_stop) for number in (signal.SIGINT, signal.SIGTERM)}
    children = []
    try:
        print(f"Arrancando Activity Hub…\nFrontend: http://127.0.0.1:{web_port}\nBackend:  http://127.0.0.1:{api_port}", flush=True)
        print("Ctrl+C detiene ambos. Entra con tu código privado; no se aplican migraciones ni se generan credenciales.", flush=True)
        for name, command, cwd in commands:
            if stop_signal:
                return 128 + stop_signal
            children.append((name, subprocess.Popen(command, cwd=cwd, env=child_env, stdin=subprocess.DEVNULL, start_new_session=True)))
        while not stop_signal:
            for name, child in children:
                code = child.poll()
                if code is not None:
                    print(f"{name} terminó (código {code}); se detiene el otro servidor.", file=sys.stderr)
                    return code if code > 0 else 1
            time.sleep(0.2)
        return 128 + stop_signal
    except OSError as error:
        print(f"No se pudieron iniciar los servidores: {error}", file=sys.stderr)
        return 1
    finally:
        try:
            stop_children(children)
        finally:
            for number, handler in previous.items():
                signal.signal(number, handler)


if __name__ == "__main__":
    raise SystemExit(main())
