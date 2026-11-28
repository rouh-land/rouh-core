"""Landing works under the lock every run starts under (Petar, 28 November 2026, task 197).

The graphics card's lock on runs (`one/hardware.py`, since 25 November) refused moving a file into
another folder, and every git push inside a run then failed with "Invalid cross-device link": run
d291042c's shared watch lists sat off main for hours. A stack test proved the lock, but it ran only
for changes to the containers, so nothing before going live stopped a change to the lock, the
sandbox or the landing tool from bringing it back. This check does, for every change of Rouh's
code: it runs a real landing - the fitting step of `bin/rouh-land`, with the real `land.sh` - in a
process under the very lock a run gets, with the code that runs, the run's clone and the
temporary folder on different filesystems wherever this machine has them, and fails on the error.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from . import check, expect

CODE = Path(__file__).resolve().parent.parent.parent

#: The child: locked as a run is, then a plain push into a local repository across folders, and
#: the fitting step of the code under check onto a main that moved on. One JSON line back.
_CHILD = r"""
import importlib.machinery, importlib.util, json, os, subprocess, sys, types
code, origin, clone, bare = sys.argv[1:5]
spec = importlib.util.spec_from_file_location("hardware", os.path.join(code, "one", "hardware.py"))
hw = importlib.util.module_from_spec(spec); spec.loader.exec_module(hw)
abi = hw.landlock_abi()
locked = False
if abi > 0:
    hw.lock_out(hw.nodes())
    locked = True
push = subprocess.run(["git", "-c", "safe.directory=*", "push", "-q", bare, "HEAD:refs/heads/main"],
                      cwd=clone, capture_output=True, text=True)
loader = importlib.machinery.SourceFileLoader("rouh_land", os.path.join(code, "bin", "rouh-land"))
spec = importlib.util.spec_from_loader("rouh_land", loader)
rl = importlib.util.module_from_spec(spec); loader.exec_module(rl)
rl.CODE = origin
target = rl.git("rev-parse", "main", cwd=origin).stdout.strip()
a = types.SimpleNamespace(run="selfcheck", title="a run's change", merge=False, base=None)
got = rl.fit(a, clone, target)
on_top = rl.git("merge-base", "--is-ancestor", target, "HEAD", cwd=clone).returncode == 0
print(json.dumps({"locked": locked, "abi": abi, "push_rc": push.returncode, "push_err": push.stderr[-300:],
                  "fit": {k: got.get(k) for k in ("state", "reason")}, "on_top": on_top}))
"""


def _places() -> list[Path]:
    """Up to three writable folders, each on a filesystem of its own where this machine has more
    than one; otherwise the same one again."""
    seen: dict[int, Path] = {}
    for base in (os.environ.get("ROUH_CHECK_DATA") or "", tempfile.gettempdir(), "/dev/shm",
                 os.path.expanduser("~"), "/var/tmp"):
        if not base or not os.path.isdir(base) or not os.access(base, os.W_OK):
            continue
        dev = os.stat(base).st_dev
        if dev not in seen:
            seen[dev] = Path(base)
    found = list(seen.values()) or [Path(tempfile.gettempdir())]
    return [found[i % len(found)] for i in range(3)]


def _git(*args: str, cwd: Path, env: dict | None = None) -> str:
    got = subprocess.run(["git", "-c", "safe.directory=*", *args], cwd=str(cwd), capture_output=True,
                         text=True, env=env)
    expect(got.returncode == 0, f"git {args[0]} failed while making the check's repositories: "
           + got.stderr.strip()[-200:])
    return got.stdout.strip()


@check("own", "a run's work lands under the lock a run starts under",
       "a process locked exactly as a run is (one/hardware.py) pushes into a local repository and fits a "
       "run's commits onto a moved main with bin/rouh-land and land.sh, across filesystems, and never "
       "hits \"Invalid cross-device link\"")
def landing_under_run_lock() -> None:
    for need in ("land.sh", "bin/rouh-land", "one/hardware.py"):
        expect((CODE / need).is_file(), f"{need} is missing from the code")
    expect(shutil.which("git") and shutil.which("bash"), "git or bash is not on this base")
    a, b, c = _places()
    made = [Path(tempfile.mkdtemp(prefix="rouh-landcheck-", dir=str(p))) for p in (a, b, c)]
    origin, clone, tmp = made[0] / "code", made[1] / "clone", made[2]
    bare = made[0] / "pushed.git"
    who = {"GIT_AUTHOR_NAME": "Check", "GIT_AUTHOR_EMAIL": "check@example.test",
           "GIT_COMMITTER_NAME": "Check", "GIT_COMMITTER_EMAIL": "check@example.test"}
    env = {**os.environ, **who, "TMPDIR": str(tmp), "GIT_TERMINAL_PROMPT": "0"}
    env.pop("ROUH_LAND_THROUGH", None)
    try:
        # The code that runs: the real land.sh and rouh-land of this change, and a main that then
        # moved on, so the run's work has to be fitted.
        origin.mkdir()
        _git("init", "-q", "-b", "main", cwd=origin)
        for rel in ("land.sh", "bin/rouh-land", "README.md"):
            src = CODE / rel
            dst = origin / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.is_file():
                shutil.copy2(src, dst)
            else:
                dst.write_text("Rouh\n")
        _git("add", "-A", cwd=origin)
        _git("commit", "-q", "-m", "the base", cwd=origin, env=env)
        base = _git("rev-parse", "HEAD", cwd=origin)
        # The run's clone, made from another filesystem (git copies where it cannot link).
        _git("clone", "-q", str(origin), str(clone), cwd=made[1], env=env)
        (origin / "docs").mkdir()
        (origin / "docs" / "moved.md").write_text("main moved on\n")
        _git("add", "-A", cwd=origin)
        _git("commit", "-q", "-m", "main moved on", cwd=origin, env=env)
        _git("checkout", "-q", "-B", "work", base, cwd=clone)
        with open(clone / "README.md", "a") as f:
            f.write("a run's change\n")
        _git("commit", "-q", "-am", "a run's change", cwd=clone, env=env)
        _git("init", "-q", "--bare", str(bare), cwd=made[0])
        got = subprocess.run([sys.executable, "-I", "-c", _CHILD, str(CODE), str(origin), str(clone), str(bare)],
                             cwd=str(clone), capture_output=True, text=True, env=env, timeout=600)
        said = got.stdout + got.stderr
        expect("cross-device" not in said, "a landing under the run lock hit \"Invalid cross-device link\": "
               + said.strip()[-400:])
        answer = {}
        for line in reversed(got.stdout.strip().splitlines()):
            try:
                answer = json.loads(line)
                break
            except ValueError:
                continue
        expect(answer, "the locked landing said nothing readable: " + said.strip()[-400:])
        expect(answer["push_rc"] == 0, "a git push into a local repository failed under the run lock: "
               + answer["push_err"].strip())
        expect(answer["fit"].get("state") == "landed" and answer["on_top"],
               "the fitting step did not land a run's work under the run lock: "
               + json.dumps(answer["fit"])[:400])
    finally:
        for p in made:
            shutil.rmtree(p, ignore_errors=True)
