"""Unstuck: the owner's press that brings a stuck Rouh to the newest release (core 1.2, 25 November 2026).

Task 98, step 98-25, gap G20. Released changes come into a Rouh strictly in order, and the walk stops
at the first one it cannot fit (``rouh/code_evolution.py``, ``hold_after``; letting later ones come in
around it broke Rouhs on 19 November 2026). So one change that will not fit holds up every change
after it, security fixes too. Until now the way out was a command typed at the machine
(``bin/rouh-catch-up --stuck``, or ``rouh-catch-up-mac stuck`` on a Mac). Meta, Changes now says
"Your Rouh is stuck" and has an Unstuck button; this is what the button asks the protected core to do.

    {"op": "unstuck", "by"}     start it; answered at once, it goes on in the background
    status()["unstuck"]         how the last one went, or that one is going

In this order, and only on the owner's press (the Rouh never asks for it by itself):

1. A full copy of the database now (pg_dump, as before a database update), in the guard's own volume
   at ``/guard/unstuck/<time>/before.dump``. No copy, nothing changes.
2. The protected core's own copy of ``rouh-catch-up --stuck`` (``/opt/rouh-guard/bin/rouh-catch-up``,
   built into this image from ``bin/rouh-catch-up``), never the Rouh's own copy of it in /code, which
   the Rouh could change: the newest release in place, this Rouh's own changes kept where they fit,
   anything left out named and kept in its history, handed to the change step as one undo point.
3. What it said, kept in ``log.txt`` beside the copy, and its last line (``ROUH-CATCH-UP {json}``) as
   the outcome: the undo point, the one before it, and the files kept, carried over or left out.

Undo: Put back on the undo point before (Meta, Changes, or ``rouh-guard undo N``), and, if the database
must go back too, with the core stopped, ``rouh-guard unstuck-restore <time>``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

log = logging.getLogger("rouh-guard")

HERE = Path(__file__).resolve().parent
#: The protected core's own copy of the catch-up.
SCRIPT = HERE.parent / "bin" / "rouh-catch-up"
#: How long the catch-up may take, its checks and the second and third choices included.
LIMIT = 3 * 3600
#: How many database copies are kept; older folders keep their record and lose their copy.
KEEP_COPIES = 3
MARK = "ROUH-CATCH-UP "


def _now() -> float:
    return time.time()


class Unstuck:
    def __init__(self, changes, *, script: Path | None = None, copy=None):
        self.changes = changes
        self.root = Path(changes.state) / "unstuck"
        self.script = Path(script or os.environ.get("ROUH_GUARD_CATCH_UP") or SCRIPT)
        self._copy = copy or self._pg_copy
        self.task: asyncio.Task | None = None
        self._recover()

    # --- the record ------------------------------------------------------------------------------

    def _file(self) -> Path:
        return self.root / "last.json"

    def last(self) -> dict:
        try:
            return json.loads(self._file().read_text())
        except (OSError, ValueError):
            return {}

    def _save(self, doc: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)
        tmp = self._file().with_suffix(".tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
        tmp.replace(self._file())

    def _recover(self) -> None:
        """A press the guard was stopped in the middle of (a base update, the machine) is said so."""
        doc = self.last()
        if doc.get("going"):
            doc.update(going=False, ok=False, finished_at=_now(),
                       said="The protected core started again while this was going, so it stopped part way. "
                            "Whatever it had not yet handed to the change step did not run; press Unstuck again.")
            self._save(doc)

    def going(self) -> bool:
        return self.task is not None and not self.task.done()

    def status(self) -> dict:
        doc = self.last()
        doc.pop("log", None)
        doc["going"] = self.going()
        doc["ready"] = self.script.is_file()
        return doc

    # --- the press -------------------------------------------------------------------------------

    async def start(self, by: str = "the Rouh") -> dict:
        if not self.script.is_file():
            return {"ok": False, "refused": "this protected core has no copy of rouh-catch-up to run"}
        if self.going():
            return {"ok": False, "refused": "Unstuck is going already; it says here when it is done"}
        if getattr(self.changes, "busy", ""):
            return {"ok": False, "refused": f"the protected core is {self.changes.busy}; press Unstuck again when it is done"}
        name = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        folder = self.root / name
        folder.mkdir(parents=True, exist_ok=True)
        os.chmod(folder, 0o700)
        doc = {"name": name, "by": by[:80], "started_at": _now(), "going": True, "step": "copying the database"}
        self._save(doc)
        self.task = asyncio.create_task(self._run(doc, folder))
        return {"ok": True, "started": True, "name": name,
                "said": "Unstuck started: a copy of the database first, then the newest release, through the protected core."}

    def _pg_copy(self, folder: Path) -> Path:
        from . import database_update

        dump = folder / "before.dump"
        database_update.pg("pg_dump", database_update.live(), "-Fc", "--file=" + str(dump))
        os.chmod(dump, 0o600)
        return dump

    def _prune(self) -> None:
        dumps = sorted(self.root.glob("*/before.dump"))
        for old in dumps[:-KEEP_COPIES]:
            old.unlink(missing_ok=True)

    async def _run(self, doc: dict, folder: Path) -> None:
        logfile = folder / "log.txt"
        try:
            try:
                dump = await asyncio.to_thread(self._copy, folder)
            except Exception as exc:  # noqa: BLE001 - said, and nothing changed
                doc.update(going=False, ok=False, finished_at=_now(), step="",
                           said="No copy of the database could be made first, so nothing was changed: " + str(exc)[:400])
                self._save(doc)
                return
            doc.update(copy=str(dump), step="bringing the newest release in")
            self._save(doc)
            await asyncio.to_thread(self._prune)
            with open(logfile, "wb") as out:
                proc = await asyncio.create_subprocess_exec(
                    sys.executable, "-I", str(self.script), "--stuck", stdout=out, stderr=asyncio.subprocess.STDOUT,
                    env={**os.environ, "PYTHONUNBUFFERED": "1"})
                try:
                    rc = await asyncio.wait_for(proc.wait(), LIMIT)
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
                    rc = -1
            text = logfile.read_text(errors="replace")
            outcome: dict = {}
            for line in text.splitlines():
                if line.startswith(MARK):
                    try:
                        outcome = json.loads(line[len(MARK):])
                    except ValueError:
                        pass
            said_lines = [ln.removeprefix("rouh-catch-up: ") for ln in text.splitlines()
                          if ln.startswith("rouh-catch-up: ")]
            if rc == -1:
                said = f"It took longer than {LIMIT // 3600} hours and was stopped."
            elif outcome.get("ok"):
                said = next((ln for ln in reversed(said_lines) if ln.startswith("done:")), "Done.")
            else:
                said = outcome.get("said") or (said_lines[-1] if said_lines else f"rouh-catch-up stopped ({rc}).")
            doc.update(going=False, ok=bool(outcome.get("ok")) and rc == 0, finished_at=_now(), step="", said=said[:1500],
                       **{k: outcome.get(k) for k in ("release", "commit", "point", "before", "own", "kept",
                                                       "carried", "dropped") if k in outcome},
                       told=said_lines[-12:])
            self._save(doc)
            log.info("unstuck %s: %s", doc["name"], said[:300])
        except Exception as exc:  # noqa: BLE001 - said on the record, never a silent end
            log.exception("unstuck %s broke", doc.get("name"))
            doc.update(going=False, ok=False, finished_at=_now(), step="",
                       said=f"The protected core broke while doing it: {type(exc).__name__}: {str(exc)[:300]}")
            self._save(doc)


def restore(name: str, state: Path | None = None) -> str:
    """``rouh-guard unstuck-restore NAME``: the database put back as it was before that Unstuck.

    As ``rouh-backup restore`` does it: only with the core stopped (a restore under a running Rouh would
    mix its writes with the copy); the database as it is now copied first, beside the one restored, so the
    restore can itself be undone; the copy restored into a new database, which takes the place of Rouh's
    own by renaming only once it has worked, so a restore that fails leaves Rouh's database as it was."""
    import psycopg

    from . import database_update

    state = Path(state or os.environ.get("ROUH_GUARD_STATE", "/guard"))
    if not name or "/" in name or name.startswith("."):
        raise ValueError("say which Unstuck, by its time (rouh-guard status, unstuck.name)")
    folder = state / "unstuck" / name
    dump = folder / "before.dump"
    if not dump.is_file():
        raise ValueError(f"there is no database copy for {name} (only the newest {KEEP_COPIES} are kept)")
    db = database_update.live()
    with psycopg.connect(**database_update._kw(db)) as conn:
        busy = conn.execute("SELECT count(*) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid() "
                            "AND backend_type = 'client backend'", (db["NAME"],)).fetchone()[0]
    if busy:
        raise ValueError(f"Rouh is still connected to its database ({busy} connections). Stop the core first "
                         "(docker compose stop core), then restore, then start it again.")
    now = folder / f"before-restore-{time.strftime('%Y%m%d-%H%M%S', time.gmtime())}.dump"
    database_update.pg("pg_dump", db, "-Fc", "--file=" + str(now))
    os.chmod(now, 0o600)
    name_db, new, old = db["NAME"], db["NAME"] + "_restoring", db["NAME"] + "_before_restore"
    admin = {**database_update._kw(db), "dbname": "postgres", "autocommit": True}

    def q(ident: str) -> str:
        return '"' + ident.replace('"', '""') + '"'

    with psycopg.connect(**admin) as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {q(new)}")
        conn.execute(f"CREATE DATABASE {q(new)}")
    try:
        database_update.pg("pg_restore", {**db, "NAME": new}, "--no-owner", "--no-privileges", "--exit-on-error", str(dump))
    except ValueError:
        with psycopg.connect(**admin) as conn:
            conn.execute(f"DROP DATABASE IF EXISTS {q(new)}")
        raise ValueError(f"the copy of {name} could not be restored; Rouh's database is as it was") from None
    with psycopg.connect(**admin) as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {q(old)}")
        conn.execute(f"ALTER DATABASE {q(name_db)} RENAME TO {q(old)}")
        conn.execute(f"ALTER DATABASE {q(new)} RENAME TO {q(name_db)}")
        conn.execute(f"DROP DATABASE {q(old)}")
    return (f"The database is as it was before Unstuck {name}; as it was just now it is kept in {now}. "
            "Start the core again.")
