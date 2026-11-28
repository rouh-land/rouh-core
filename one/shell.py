"""Rouh's read-only shell, run here in the containers, where the one program holds no key.

On the server Rouh answers "how much disk is left" with a short command it runs itself, read-only,
in a sandbox (`rouh/tools.py`, `run_command`). In the containers every Rouh instance runs, Rouh's
core holds every key, so a command run there could read them; it runs here instead, in the worker,
which holds none (deploy/stack/compose.yml). Rouh still decides what may run: it checks the
command against its own read-only rules first (`plan_pipeline`) and sends only the stages it
allowed, each an argument list, wired together here without a shell. Only Rouh's own connection
may ask (`rules.ALLOWED`, "voice"), and only where the worker says so (`ONE_SHELL_FOR_ROUH=1`).

Each stage runs inside the same box as on the server (`rouh/sandbox.py`): the files read-only and
the network closed by the kernel. In the worker that is Landlock, because Docker's syscall filter
refuses bubblewrap its namespaces; the stack sets `ROUH_SANDBOX=required` there, so with no box
nothing runs. The program looks once, as it starts, and writes what it found beside its socket
(`sandbox.json`), where the core's server_health reads it (task 139, step 139-14).

**The owner's chat in Unrestricted** (`run_free`). Petar, 28 November 2026: "the purpose of
unrestricted mode is not to have those limitations and not have to have those conversations." So
when Rouh's core says the command is the owner's own chat's while their switch is Unrestricted
(`rouh/tools.py`, `_run_command`), the whole command runs, through bash, with no box: it may
write, chain, redirect and use the network. Its way out is the run door under an identity of its
own (`peers.CHAT`), which the key proxy lets as far as an owner's free run - any server, GitHub as
the owner, and the owner's standing servers, the machine Rouh runs on with its sudo among them -
only while Rouh's core says the switch is Unrestricted (`rouh/run_access.py`, `entries`).
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import time

from rouh import sandbox

#: Beside the program's socket, in the volume the core and the worker share (/run/one).
STATE_FILE = "sandbox.json"
#: The box this program's stages run in, looked at once (`look`).
_box: sandbox.Sandbox | None = None


def look() -> sandbox.Sandbox:
    """The box, found once from `ROUH_SANDBOX` and `ROUH_SANDBOX_NETWORK`."""
    global _box
    if _box is None:
        mode = (os.environ.get("ROUH_SANDBOX") or "auto").strip().lower()
        network = (os.environ.get("ROUH_SANDBOX_NETWORK") or "").strip().lower() in ("1", "true", "yes", "on")
        _box = sandbox.Sandbox(mode=mode if mode in sandbox.MODES else "auto", network=network).look()
    return _box


def write_state(socket_path: str) -> dict:
    """Look, and write what was found beside the socket for the core to read."""
    state = look().state()
    path = os.path.join(os.path.dirname(socket_path) or ".", STATE_FILE)
    try:
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, path)
    except OSError:
        pass
    return state

#: What a stage may be at most, and the whole of what may be asked.
MOST_STAGES = 6
MOST_ARGS = 64


def run(stages, *, cwd: str, timeout: float = 20, limit: int = 4000) -> str:
    if not isinstance(stages, list) or not stages or len(stages) > MOST_STAGES:
        return "Nothing to run."
    for parts in stages:
        if not isinstance(parts, list) or not parts or len(parts) > MOST_ARGS \
                or not all(isinstance(p, str) for p in parts):
            return "That is not a command this shell runs."
    box = look()
    refused = box.refusal()
    if refused:
        return refused
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": os.environ.get("HOME", "/tmp"),
           "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
    cwd = cwd if os.path.isdir(cwd) else os.environ.get("HOME", "/")
    procs: list[subprocess.Popen] = []
    try:
        for i, parts in enumerate(stages):
            procs.append(subprocess.Popen(box.wrap(parts, cwd=cwd), cwd=cwd, env=env, text=True,
                                          stdin=procs[-1].stdout if procs else subprocess.DEVNULL,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE))
            if i:
                procs[-2].stdout.close()
        out, err = procs[-1].communicate(timeout=min(float(timeout), 30))
        for proc in procs[:-1]:
            proc.wait(timeout=1)
    except subprocess.TimeoutExpired:
        for proc in procs:
            proc.kill()
        return f"Timed out after {int(timeout)} seconds."
    except (OSError, ValueError) as exc:
        return f"{type(exc).__name__}: {exc}"
    text = out or err or "(no output)"
    limit = min(int(limit), 8000)
    return text[:limit] + f"\n... cut off at {limit} characters." if len(text) > limit else text


#: How long a command of the owner's chat may run, by default and at most: a turn waits for it.
FREE_TIMEOUT = 60.0
MOST_FREE_TIMEOUT = 300.0
MOST_FREE_CHARACTERS = 16000


def _free_env() -> dict:
    """What a command of the owner's chat starts with: the worker's own tools, the run door, and
    nothing of the program's own (its settings and sockets are not the chat's)."""
    home = os.environ.get("HOME", "/tmp")
    keep = ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy", "NO_PROXY", "no_proxy", "USER",
            "LOGNAME", "TZ")
    env = {k: os.environ[k] for k in keep if os.environ.get(k)}
    env.update({"HOME": home, "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TERM": "dumb",
                "PATH": f"{home}/.local/bin:/code/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:"
                        "/sbin:/bin",
                "ROUH_CHAT_COMMAND": "1"})
    return env


def run_free(command: str, *, holders: dict, timeout: float = FREE_TIMEOUT, limit: int = 8000,
             cwd: str = "") -> str:
    """The owner's chat's command, whole, through bash, with no box (see the top of this file).

    ``holders`` is the program's {pid: start time} of the chat's commands now, which the run door
    reads to know a connection is the chat's (`peers.CHAT`): this command's bash is one of them
    while it runs, and what it starts is its by the kernel's process tree."""
    from . import peers

    command = str(command or "").strip()
    if not command:
        return "There was no command."
    timeout = max(1.0, min(float(timeout or FREE_TIMEOUT), MOST_FREE_TIMEOUT))
    limit = max(200, min(int(limit or 8000), MOST_FREE_CHARACTERS))
    home = os.environ.get("HOME", "/tmp")
    cwd = cwd if cwd and os.path.isdir(cwd) else home
    try:
        proc = subprocess.Popen(["bash", "-c", command], cwd=cwd, env=_free_env(), text=True,
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, start_new_session=True)
    except OSError as exc:
        return f"{type(exc).__name__}: {exc}"
    holders[proc.pid] = peers.started(proc.pid)
    started = time.monotonic()
    try:
        try:
            out, _ = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except OSError:
                proc.kill()
            out, _ = proc.communicate()
            return (_cut(out or "", limit) + f"\n... stopped after {int(timeout)} seconds: it was still "
                    "running. Give a longer timeout, or start long work as a job.")
    finally:
        holders.pop(proc.pid, None)
    took = time.monotonic() - started
    text = _cut(out or "", limit) or "(no output)"
    if proc.returncode:
        text += f"\n(exit {proc.returncode}, {took:.1f} s)"
    return text


def _cut(text: str, limit: int) -> str:
    return text[:limit] + f"\n... cut off at {limit} characters." if len(text) > limit else text
