"""One Rouh in one file: its database, its two keys, its data directory, its workspace and its own code.

Petar, 29 October 2026: every Rouh can be brought into the containers, his own included, and
the weekly copy off the machine must be one that restores. Both are this file, a plain tar:

    rouh-bundle/bundle.json            what it is (never a key): when and where it was made,
                                       the database's size and SHA-256, what else is in it
    rouh-bundle/database.dump          pg_dump of Rouh's database, custom format (-Fc)
    rouh-bundle/keys/encryption.key    the key every saved login is sealed with (rouh/encryption.py)
    rouh-bundle/keys/django-secret.key the key sign-ins are signed with (losing it only signs people out)
    rouh-bundle/data/...               the data directory (ROUH_DATA_DIR): attachments, files, pages
    rouh-bundle/workspace/...          the workspace (ROUH_WORKSPACE), its git history included
    rouh-bundle/files/...              the one store every file lives in (`rouh/filestore.py`),
                                       when it is not inside the data directory already
    rouh-bundle/code/code.bundle       Rouh's own code (ROUH_APP_DIR, /code in a stack) with its
                                       whole git history: every branch and tag, as `git bundle`
    rouh-bundle/code/code.json         what that code is: the commit it is at, its branch, the
                                       release it was installed from (.git/rouh-installed.json)
    rouh-bundle/code/ledger.json       the update ledger (`rouh/code_evolution.py`): which released
    rouh-bundle/code/update.json       changes this Rouh took and which wait, and its updates' own
    rouh-bundle/code/settings.json     state and choice (`rouh/code_update.py`)

Task 98, gap G19 (25 November 2026), Petar: "our backups don't copy the code? they should!" Since
23 October 2026 a Rouh's code is its own, changed by its genes, so a copy without it brought back
only the stock Rouh. Version 2 carries it; a bundle of version 1, without it, still reads, and is
brought back on the newest tested Rouh as before. Bringing it back (`linux_stack.py import`) puts the
code in the stack's code volume and has the release's protected core check it, as an update is
checked, before anything runs on it; the core's start then brings the database up to that code, and
the ordinary update (`rouh/code_update.py`), reading the ledger that came with it, takes it on to
any newer release.

Made by ``python manage.py export_rouh`` on any Rouh, a server's own (from its checkout
with its own settings) or a stack's core, and by the weekly copy (`rouh/offsite.py`), which
encrypts it before it leaves; put into a fresh stack by ``linux_stack.py import``. Left out of
the data directory: what is not the Rouh's to move (`SKIP`).

The two keys are in it, so the file opens every saved login it holds: it is written readable by
its owner alone, never to a terminal, and nothing here prints or logs a key.

Standard library only: deploy/container/linux_stack.py, which runs on the person's machine with
nothing installed, reads bundles with it.
"""
from __future__ import annotations

import datetime as dt
import fnmatch
import hashlib
import json
import os
import socket
import subprocess
import tarfile
from typing import BinaryIO

FORMAT, VERSION = "rouh-bundle", 2
#: The versions this reads: 1 had no code in it.
READS = (1, 2)
TOP = "rouh-bundle"
ABOUT, DUMP = f"{TOP}/bundle.json", f"{TOP}/database.dump"
ENCRYPTION_KEY, DJANGO_KEY = f"{TOP}/keys/encryption.key", f"{TOP}/keys/django-secret.key"
DATA, WORKSPACE, FILES = f"{TOP}/data", f"{TOP}/workspace", f"{TOP}/files"
CODE = f"{TOP}/code"
CODE_BUNDLE, CODE_ABOUT = f"{CODE}/code.bundle", f"{CODE}/code.json"
#: The update ledger and its state, by their names in the code-update folder and in the bundle.
LEDGER = (("ledger.json", f"{CODE}/ledger.json"), ("state.json", f"{CODE}/update.json"),
          ("settings.json", f"{CODE}/settings.json"))
#: Inside the data directory, never moved: what an update keeps only while it works, and a copy of
#: shared main it fetches again (`rouh/code_update.py`'s folder).
SKIP_INSIDE = ("code-update/master.git", "code-update/work", "code-update/backups", "code-update/.lock")
#: Never moved, by name at the top of the data directory: the keys (each has its own place
#: above), a checkout of main GitHub has (workspace-saves), SQLite from before PostgreSQL, the
#: logs, the weekly copy's own work, and what only a file system makes.
SKIP = ("secret.key", "django-secret.key", "workspace-saves", "rouh.sqlite3*", "jarvis.sqlite3*",
        "logs", "offsite", "lost+found")


class NotABundle(ValueError):
    """Not a bundle this can read, with the reason."""


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _first(env_names: tuple[str, ...], paths: tuple[str, ...]) -> str:
    for name in env_names:
        said = (os.environ.get(name) or "").strip()
        if said:
            return said
    for path in paths:
        try:
            with open(path, encoding="utf-8") as fh:
                kept = fh.read().strip()
        except OSError:
            continue
        if kept:
            return kept
    return ""


def find_encryption_key(data_dir: str) -> str:
    """This Rouh's encryption key, as rouh/encryption.py finds it: the environment, else, in a stack,
    the keys volume (the core's start hands the server it from there, and a command run beside the
    server with `docker compose exec` is not handed it), else the file in the data directory."""
    keys = os.environ.get("ROUH_KEYS_DIR") or ""
    return _first(("ROUH_ENCRYPTION_KEY",), ((os.path.join(keys, "encryption.key"),) if keys else ())
                  + (os.path.join(data_dir, "secret.key"),))


def find_django_key(data_dir: str) -> str:
    """The key sign-ins are signed with, as rouh/project/settings.py finds it."""
    return _first(("ROUH_SECRET_KEY", "DJANGO_SECRET_KEY"), (os.path.join(data_dir, "django-secret.key"),))


def _plain(ti: tarfile.TarInfo) -> tarfile.TarInfo:
    """Nobody's names or numbers of the machine it was made on; the importer gives every file to
    the Rouh's own user."""
    ti.uid = ti.gid = 0
    ti.uname = ti.gname = ""
    return ti


def _skipped(rel: str) -> bool:
    top = rel.split("/", 1)[0]
    return any(fnmatch.fnmatch(top, pat) for pat in SKIP) or any(
        rel == inner or rel.startswith(inner + "/") for inner in SKIP_INSIDE)


def _files(root: str, *, skip_top: bool, inside: str = "", unreadable: list | None = None) -> list[str]:
    """Every path under root, relative, sorted; without what SKIP names at its top, without
    `inside`, another folder of the bundle that happens to be under this one, and without what this
    user cannot read, which goes into `unreadable` (a file a command run as root left behind)."""
    out: list[str] = []
    if not root or not os.path.isdir(root):
        return out
    unreadable = unreadable if unreadable is not None else []
    for here, dirs, names in os.walk(root):
        rel_here = os.path.relpath(here, root)
        keep = []
        for d in sorted(dirs):
            rel = os.path.normpath(os.path.join(rel_here, d))
            full = os.path.join(here, d)
            if (skip_top and _skipped(rel)) or (inside and os.path.realpath(full) == os.path.realpath(inside)):
                continue
            if not os.path.islink(full) and not os.access(full, os.R_OK | os.X_OK):
                unreadable.append(rel)
                continue
            out.append(rel)
            if not os.path.islink(full):
                keep.append(d)
        dirs[:] = keep
        for n in sorted(names):
            rel = os.path.normpath(os.path.join(rel_here, n))
            if skip_top and _skipped(rel):
                continue
            full = os.path.join(here, n)
            if not os.path.islink(full) and not os.access(full, os.R_OK):
                unreadable.append(rel)
                continue
            out.append(rel)
    return out


def _git(code_dir: str, *args: str, timeout: float = 600) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-c", "safe.directory=*", "-C", code_dir, *args], capture_output=True,
                          text=True, timeout=timeout, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})


def code_part(code_dir: str, into: str) -> dict:
    """Rouh's own code as one `git bundle` of every branch and tag, written to into, and what code.json
    says of it; {} when code_dir is no git repository with a commit (a test world, an old copy)."""
    if not code_dir or not os.path.isdir(os.path.join(code_dir, ".git")):
        return {}
    head = _git(code_dir, "rev-parse", "--verify", "-q", "HEAD")
    if head.returncode or not head.stdout.strip():
        return {}
    made = _git(code_dir, "bundle", "create", into, "--all", timeout=1800)
    if made.returncode:
        raise RuntimeError(f"Rouh's own code could not be put in the copy: {(made.stderr or made.stdout).strip()[-300:]}")
    installed = {}
    try:
        with open(os.path.join(code_dir, ".git", "rouh-installed.json"), encoding="utf-8") as fh:
            installed = json.load(fh)
    except (OSError, ValueError):
        installed = {}
    dirty = [line for line in _git(code_dir, "status", "--porcelain").stdout.splitlines() if line.strip()]
    return {"file": "code/code.bundle", "bytes": os.path.getsize(into), "sha256": sha256_of(into),
            "head": head.stdout.strip(), "branch": _git(code_dir, "symbolic-ref", "--short", "-q", "HEAD").stdout.strip(),
            "subject": _git(code_dir, "log", "-1", "--format=%s").stdout.strip()[:200],
            "commits": int((_git(code_dir, "rev-list", "--count", "--all").stdout.strip() or "0")),
            "installed": installed if isinstance(installed, dict) else {},
            # Work not committed is not in a git bundle: counted, so its absence is never silent.
            "uncommitted": len(dirty)}


def ledger_part(update_dir: str) -> tuple[dict, list[tuple[str, bytes]]]:
    """The update ledger and its state out of the code-update folder: what bundle.json says of them,
    and each file's name in the bundle with its bytes."""
    files: list[tuple[str, bytes]] = []
    summary: dict = {}
    for name, arc in LEDGER:
        try:
            with open(os.path.join(update_dir, name), "rb") as fh:
                raw = fh.read()
        except OSError:
            continue
        files.append((arc, raw))
        if name == "ledger.json":
            try:
                rows = json.loads(raw).get("changes") or []
            except (ValueError, AttributeError):
                rows = []
            # As `rouh/code_evolution.py` says them (TAKEN, STATUS); this file reads them without it.
            taken = [r for r in rows if str(r.get("status") or "") in ("copied", "adapted")]
            summary = {"changes": len(rows), "taken": len(taken),
                       "waiting": sum(1 for r in rows if str(r.get("status") or "") in ("waiting", "depends")),
                       "newest_taken": str((taken[-1] if taken else {}).get("master") or "")[:40]}
    return summary, files


def make(out: BinaryIO, *, dump: str, data_dir: str, workspace: str, encryption_key: str = "",
         django_key: str = "", made_by: str = "", files_dir: str = "", code_dir: str = "",
         update_dir: str = "", work: str = "") -> dict:
    """Writes the bundle as a tar stream into out and gives back what bundle.json says.

    dump is a pg_dump -Fc file already made; the keys are their text, either empty for none. code_dir
    is Rouh's own code, a git repository, and update_dir its update folder (`rouh/code_update.py`); work
    is where the code's git bundle is made on the way, removed after."""
    import shutil
    import tempfile

    held = tempfile.mkdtemp(prefix="rouh-bundle-code-", dir=work or None)
    try:
        os.chmod(held, 0o700)
        code = code_part(code_dir, os.path.join(held, "code.bundle"))
        ledger, ledger_files = ledger_part(update_dir) if update_dir else ({}, [])
        if code:
            code["ledger"] = ledger
        return _make(out, dump=dump, data_dir=data_dir, workspace=workspace, encryption_key=encryption_key,
                     django_key=django_key, made_by=made_by, files_dir=files_dir, code=code,
                     code_file=os.path.join(held, "code.bundle"), ledger_files=ledger_files)
    finally:
        shutil.rmtree(held, ignore_errors=True)


def _make(out: BinaryIO, *, dump: str, data_dir: str, workspace: str, encryption_key: str, django_key: str,
          made_by: str, files_dir: str, code: dict, code_file: str, ledger_files: list) -> dict:
    unreadable: list[str] = []
    data = _files(data_dir, skip_top=True, inside=workspace, unreadable=unreadable)
    work = _files(workspace, skip_top=False, unreadable=unreadable)
    real_data = os.path.realpath(data_dir) + os.sep if data_dir else ""
    if files_dir and real_data and (os.path.realpath(files_dir) + os.sep).startswith(real_data):
        files_dir = ""                 # already in the data directory's part
    kept = _files(files_dir, skip_top=False, unreadable=unreadable) if files_dir else []
    about = {
        "format": FORMAT, "version": VERSION,
        "made_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "made_on": os.environ.get("ROUH_STACK_NAME") or socket.gethostname(), "made_by": made_by,
        "database": {"file": "database.dump", "bytes": os.path.getsize(dump), "sha256": sha256_of(dump)},
        "encryption_key": bool(encryption_key.strip()), "django_key": bool(django_key.strip()),
        "data_files": len(data), "workspace_files": len(work), "store_files": len(kept),
        # Left out because this user may not read them; named, so nothing is lost without a word.
        "unreadable": len(unreadable), "unreadable_first": unreadable[:20],
        # Rouh's own code and its update ledger (version 2): {} when there was no code to copy.
        "code": code,
    }
    with tarfile.open(fileobj=out, mode="w|", format=tarfile.PAX_FORMAT) as t:
        _add_bytes(t, ABOUT, (json.dumps(about, indent=1) + "\n").encode(), 0o644)
        t.add(dump, arcname=DUMP, recursive=False, filter=_plain)
        for name, text in ((ENCRYPTION_KEY, encryption_key), (DJANGO_KEY, django_key)):
            if text.strip():
                _add_bytes(t, name, (text.strip() + "\n").encode(), 0o400)
        if code:
            _add_bytes(t, CODE, None, 0o750)
            _add_bytes(t, CODE_ABOUT, (json.dumps(code, indent=1) + "\n").encode(), 0o644)
            t.add(code_file, arcname=CODE_BUNDLE, recursive=False, filter=_plain)
            for arc, raw in ledger_files:
                _add_bytes(t, arc, raw, 0o600)
        for prefix, root, rels in ((DATA, data_dir, data), (WORKSPACE, workspace, work),
                                   *(((FILES, files_dir, kept),) if files_dir else ())):
            _add_bytes(t, prefix, None, 0o750)
            for rel in rels:
                try:
                    t.add(os.path.join(root, rel), arcname=f"{prefix}/{rel}", recursive=False, filter=_plain)
                except FileNotFoundError:
                    continue  # gone while the bundle was made: it was not there to move
    return about


def _add_bytes(t: tarfile.TarFile, name: str, data: bytes | None, mode: int) -> None:
    import io
    import time

    ti = _plain(tarfile.TarInfo(name))
    ti.mode, ti.mtime = mode, int(time.time())
    if data is None:
        ti.type = tarfile.DIRTYPE
        t.addfile(ti)
    else:
        ti.size = len(data)
        t.addfile(ti, io.BytesIO(data))


def read_about(path: str) -> dict:
    """What a bundle says it is, after checking it is one: its bundle.json, its database, and the
    keys it says it has. NotABundle with the reason otherwise."""
    try:
        with tarfile.open(path, mode="r:") as t:
            names = set(t.getnames())
            if ABOUT not in names:
                raise NotABundle("it has no rouh-bundle/bundle.json: it is not a bundle of a Rouh")
            about = json.loads(t.extractfile(ABOUT).read())
    except (tarfile.TarError, OSError, ValueError) as e:
        if isinstance(e, NotABundle):
            raise
        raise NotABundle(f"it could not be read as a bundle ({e})") from e
    if about.get("format") != FORMAT or about.get("version") not in READS:
        raise NotABundle(f"it is {about.get('format')!r} version {about.get('version')!r}, "
                         f"and this reads {FORMAT} versions {', '.join(map(str, READS))}")
    if DUMP not in names:
        raise NotABundle("it has no database in it")
    if (about.get("code") or {}).get("head") and CODE_BUNDLE not in names:
        raise NotABundle("it says it holds Rouh's own code and does not")
    for flag, name in (("encryption_key", ENCRYPTION_KEY), ("django_key", DJANGO_KEY)):
        if about.get(flag) and name not in names:
            raise NotABundle(f"it says it holds {name.rsplit('/', 1)[-1]} and does not")
    return about


def check_dump(path: str, about: dict) -> None:
    """The database in the bundle is the one bundle.json describes, byte for byte."""
    h = hashlib.sha256()
    with tarfile.open(path, mode="r:") as t:
        f = t.extractfile(DUMP)
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    if h.hexdigest() != (about.get("database") or {}).get("sha256"):
        raise NotABundle("its database is not the one it describes: the file was changed or cut short")


def check_code(path: str, about: dict) -> None:
    """The code in the bundle is the one code.json describes, byte for byte."""
    code = about.get("code") or {}
    if not code.get("head"):
        return
    h = hashlib.sha256()
    with tarfile.open(path, mode="r:") as t:
        f = t.extractfile(CODE_BUNDLE)
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    if h.hexdigest() != code.get("sha256"):
        raise NotABundle("its code is not the one it describes: the file was changed or cut short")


def describe_code(about: dict) -> str:
    code = about.get("code") or {}
    if not code.get("head"):
        return "no code of its own (a copy made before 25 November 2026, or a Rouh with none)"
    ledger = code.get("ledger") or {}
    said = (f"its own code with its whole history ({code.get('commits', 0)} commits, at {str(code['head'])[:12]}"
            + (f" on {code['branch']}" if code.get("branch") else "") + ")")
    if ledger:
        said += (f" and its update ledger ({ledger.get('taken', 0)} released change(s) taken, "
                 f"{ledger.get('waiting', 0)} waiting)")
    if code.get("uncommitted"):
        said += f"; {code['uncommitted']} file(s) changed and never committed were not in it"
    return said


def describe(about: dict) -> str:
    db = about.get("database") or {}
    keys = [n for n, k in (("the encryption key", "encryption_key"), ("the Django key", "django_key")) if about.get(k)]
    return (f"a Rouh made {about.get('made_at')} on {about.get('made_on')}: its database "
            f"({int(db.get('bytes') or 0) / 1e6:.1f} MB), " + (", ".join(keys) + ", " if keys else "no keys, ")
            + f"{about.get('data_files', 0)} files of its data directory and {about.get('workspace_files', 0)} of its workspace, "
            + describe_code(about)
            + (f"; {about['unreadable']} it could not read were left out ({', '.join(about.get('unreadable_first') or [])})"
               if about.get("unreadable") else ""))
