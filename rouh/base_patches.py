"""The nightly base patch job: patch-level fixes to what every Rouh runs on, found, built, checked, published.

Petar, 23 October 2026: "latest" for a Rouh means only patch-level fixes to what it runs on, and
those go in automatically; features, Rouh's own logic, its own security fixes and big library
upgrades reach a Rouh only as genes, because each user's Rouh changes its own code and a pull
must never overwrite it. So the base image (deploy/container/Dockerfile.base) holds no Rouh code,
and this job keeps it patched:

1. **Look** (here, on the Creator Rouh, the owner's Rouh, the one that makes Rouh's
   releases): `deploy/container/base_patch.py look` over the version list in main,
   ``deploy/container/base/``: every pinned Python library, the python:3.12.x-slim base, Node,
   Codex, Debian's security updates and Chromium's security releases (against the Debian packages
   of the published level, read out of its public image), and the database image (PostgreSQL
   counted major.patch, pinned by digest), patch-level only. Anything newer than a patch is
   listed and left for genes.
2. **Open a pull request on main**: the line's next level is committed on top of main, on a
   branch of its own, ``base-patch/<level>``, and pushed with the git key this Rouh already has.
   That push starts `.github/workflows/base.yml`, which opens the pull request (it shows every
   version that changes) and runs its tests on GitHub's Intel and Arm runners: it builds the base
   and the protected core (rouh-guard, guard/README.md) and runs the whole check on them with the
   newest commit of main that passed its tests (rouh-check: the base's parts, the headless browser
   over MCP, the frozen security checks and Rouh's own checks). Only if everything passes on both
   does it merge the pull request by moving main to exactly the commit it tested, tag that commit
   ``base-<level>``, and publish it as a signed release of format 2 that moves rouh.land's
   /mac/release/stable.json - "latest" - to it, with its records on the GitHub Release
   ``base-<level>``. A failed one stays open on GitHub, saying what failed.
   The publish job runs in the environment release-signing, which waits for the owner's yes on
   GitHub (its Review deployments button). Nobody but the owner gives it, and nothing here goes
   round it.
3. **Say how it went.** This reads git only, as its key allows: the tag ``base-<level>`` is a
   published level; the ref ``refs/base-failed/<level>``, an annotated tag the workflow writes,
   is a failed one, with which job and step in its message. It watches for up to three hours, and
   again the next night, and a failure is told to the owner once: which update, which step, the
   pull request. A level that passed and is merged into main but has no tag yet is **waiting for
   the owner's approval** to publish, never failed: main holds only a level whose checks passed,
   and the merge job leaves the tag ``base-waiting-<level>`` saying which run waits (the run
   whose Review deployments page is the one press there is to make). That is told once a level,
   with that link, and the level pushed after it is said to be queued behind it (base.yml's runs
   are one at a time, so it does not start until the one ahead is done), not timed out; it is
   not pushed again every night, which only cancelled the one in the queue and queued another.
   Until 28 November 2026 a waiting level was told as "failed its checks" after three hours, with
   a pull request link that found nothing (1.0.12, 1.0.22, 1.0.23). A level that says nothing in
   three hours is said on its Clockwork line, never as a failure and never as a notice: only a
   job that failed is called failed. A success is the Clockwork line and nothing else (Petar's N1: a notice only
   when he must act or know). The next night's look starts from main, which only ever holds a
   level that passed, so a failed level is tried again under the same number, on the same
   branch and the same pull request.

Until 30 October 2026 the version list lived on a branch of its own, ``base``, which this pushed
the next level onto; that branch is kept, read-only, as ``archive/base-branch-until-2026-10``.

How the owner is told: a notice from Rouh (`notices.notify`, on the screen and then the phone),
because this job is Rouh's own and not a worker's, and notify_owner is how a worker asks Rouh
to tell the owner. It is the same note, one step shorter.

**Library patches wait for the week.** Some libraries publish a patch nearly every day (boto3),
and each new level is a download on every Mac and an hour of build minutes. So a level is made
the same night for anything that matters for safety - a Debian security update (Chromium's
among them), a Python, Node, Codex or PostgreSQL patch - and otherwise once a week, with every
library patch gathered since.

**When.** A row of Rouh's own scheduled work, a reminder of kind ``server`` whose job is
``base_patch``, daily at 00:40 on the owner's clock (before the nightly runs), so it is on
Clockwork as "Rouh's own server job: Nightly base image patch check", paused, resumed or moved
there like the others. Only on the Creator Rouh, the one that makes Rouh's releases: one whose code
is a checkout of Rouh's release repository, or that says so with ``ROUH_MAKES_RELEASES=1``. No
Rouh instance (every other Rouh) has it.

**In the containers** (deploy/stack/compose.yml) the Rouh has no git key and no way to GitHub of its
own. There the Creator Rouh's protected core holds the one key that can write to rouh-core, and
only when its owner set ``ROUH_GUARD_UPSTREAM`` (guard/rouh_guard/upstream.py, task 161): it keeps
rouh-core's main, the base tags and the failure refs fetched into /code under ``refs/upstream/``,
which this reads, and a level is handed to it (``push_branch``), which checks it with the change
step's checks and pushes ``base-patch/<level>`` only if they pass and it changes nothing but the
version list. ``_through_guard`` says which way this Rouh goes.

Where a gene update will come in: never here. This job only patches the base; a Rouh's code
changes as a gene, a commit in that Rouh's own /code.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import pwd
import re
import subprocess
import time
from pathlib import Path

from . import github_org

log = logging.getLogger("rouh.base_patches")

JOB = "base_patch"
TITLE = "Nightly base image patch check"
WHAT = ("Look for patch-level fixes to what Rouh runs on, build and check a new base with them, "
        "and publish it only if every check passes")
AT = "00:40"
#: Rouh's release repository, as a git remote names it.
#: Its organisation is rouh/github_org.py's.
RELEASE_REPO = re.compile(rf"{github_org.ANY}/rouh-core(\.git)?$")
#: The version list, in main.
STATE = Path("deploy") / "container" / "base"
#: The branch each level is pushed on; base.yml opens its pull request.
BRANCH = "base-patch/{level}"
#: Where base.yml says a level failed (an annotated tag object: which job and step).
FAILED = "refs/base-failed/{level}"
#: Where base.yml says a level passed and is merged, its publish waiting for the owner's yes
#: (an annotated tag: which run waits). Under refs/tags/base-*, which the protected core fetches.
WAITING = "refs/tags/base-waiting-{level}"
#: rouh-core's main, as the Creator Rouh's protected core keeps it fetched into /code.
UPSTREAM = "refs/upstream/heads/main"
GITHUB = f"https://github.com/{github_org.org()}/rouh-core"
#: The Base image workflow's runs on GitHub.
RUNS = f"{GITHUB}/actions/workflows/base.yml"
#: Its runs waiting for a reviewer, read unsigned (public), when no tag says which run waits.
WAITING_API = "https://api.github.com/repos/{org}/rouh-core/actions/workflows/base.yml/runs?status=waiting&per_page=20"
#: How long a pushed level is watched for its result before the next night takes it up.
WATCH_FOR = 3 * 3600
WATCH_EVERY = 300
#: How long library patches alone wait before they make a level of their own.
LIBRARIES_WAIT = 7 * 86400


def _cfg():
    from .config import config

    return config


def _app_dir() -> Path:
    return Path(os.environ.get("ROUH_APP_DIR") or getattr(_cfg(), "app_dir", "/var/www/rouh/app"))


def _git(*args, cwd: Path, timeout: float = 300) -> subprocess.CompletedProcess:
    # git reads who may use a checkout (safe.directory) and its keys from the home folder, which
    # a service started without HOME does not say; the user's own is taken then.
    home_dir = os.environ.get("HOME") or pwd.getpwuid(os.getuid()).pw_dir
    return subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=timeout,
                          env=dict(os.environ, GIT_TERMINAL_PROMPT="0", HOME=home_dir))


def origin_url() -> str:
    r = _git("remote", "get-url", "origin", cwd=_app_dir(), timeout=20)
    return r.stdout.strip() if r.returncode == 0 else ""


def _through_guard() -> bool:
    """Whether this Rouh's git reaches rouh-core through its protected core (the Creator Rouh in
    the containers) rather than with a key of its own (the Creator Rouh on the server)."""
    from . import guardface

    if not guardface.here():
        return False
    try:
        got = guardface.ask("upstream", timeout=30)
        return bool(got.get("on") and got.get("ready"))
    except (guardface.Refused, guardface.Unavailable):
        return False


def makes_releases() -> bool:
    """Whether this Rouh is the one that makes Rouh's releases (see the module)."""
    said = os.environ.get("ROUH_MAKES_RELEASES", "").strip()
    if said:
        return said not in ("0", "no", "false")
    return _through_guard() or bool(RELEASE_REPO.search(origin_url()))


def ensure(who):
    """The owner's row for the nightly job, made once (daily at 00:40 on their clock), only on the
    Rouh that makes releases. A paused or moved row stays as it was left."""
    from . import clock, reminders

    if not makes_releases():
        return None
    got = reminders.server_row(who, JOB)
    if got is not None:
        return got
    with clock.person(who):
        first = reminders.moment_of(AT)
    row = reminders.add_server(who, job=JOB, title=TITLE, what=WHAT, first=first, repeat="daily")
    log.info("the nightly base patch check is scheduled for %s/%s at %s (reminder %s)",
             who.org_id, who.user_id, AT, row.id)
    return row


# --- the folder it works in ---------------------------------------------------------------------


def home() -> Path:
    data = Path(getattr(_cfg(), "data_dir", "") or os.environ.get("ROUH_DATA_DIR") or "/var/www/rouh/data")
    return data / "base-patches"


def _record_file() -> Path:
    return home() / "record.json"


def record() -> dict:
    try:
        return json.loads(_record_file().read_text())
    except (OSError, ValueError):
        return {}


def _keep(rec: dict) -> None:
    home().mkdir(parents=True, exist_ok=True)
    tmp = _record_file().with_suffix(".tmp")
    tmp.write_text(json.dumps(rec, indent=1, sort_keys=True))
    tmp.replace(_record_file())


def _state() -> Path:
    """A clone of the release repository with main checked out, fetched afresh; the version list
    is its deploy/container/base/. Never the live checkout: nothing here touches the code Rouh
    runs from."""
    repo = home() / "repo"
    guarded = _through_guard()
    url = str(_app_dir()) if guarded else origin_url()
    if guarded:
        # The protected core fetches rouh-core first; main is then read out of /code.
        from . import guardface

        guardface.ask("upstream", fetch=True, timeout=300)
    if not url:
        raise RuntimeError("this Rouh's code has no origin to fetch main from")
    if not (repo / ".git").is_dir():
        home().mkdir(parents=True, exist_ok=True)
        r = _git("clone", "-q", "--no-checkout", "--filter=blob:none", url, str(repo), cwd=home(), timeout=600)
        if r.returncode:
            raise RuntimeError(f"could not clone {url}: {r.stderr.strip()[-300:]}")
    if guarded:
        _git("remote", "set-url", "origin", url, cwd=repo, timeout=20)
    r = _git("fetch", "-q", "origin", f"+{UPSTREAM if guarded else 'refs/heads/main'}:refs/remotes/origin/main", cwd=repo)
    if r.returncode:
        raise RuntimeError(f"main could not be fetched: {r.stderr.strip()[-300:]}")
    _git("checkout", "-q", "-B", "main", "origin/main", cwd=repo)
    _git("reset", "-q", "--hard", "origin/main", cwd=repo)
    _git("clean", "-qfd", cwd=repo)
    return repo


def _result(repo: Path, level: str) -> dict | None:
    """How base.yml left `level`, from git alone: None while it says nothing yet."""
    tag, failed = f"refs/tags/base-{level}", FAILED.format(level=level)
    if _through_guard():
        # Fetched into /code by the protected core, under refs/upstream/.
        code = _app_dir()
        tag, failed = tag.replace("refs/", "refs/upstream/", 1), failed.replace("refs/", "refs/upstream/", 1)
        r = _git("for-each-ref", "--format=%(objectname)\t%(refname)", tag, failed, cwd=code, timeout=20)
        refs = {line.split("\t")[1] for line in r.stdout.splitlines() if "\t" in line}
        if tag in refs:
            return {"level": level, "ok": True, "run": f"{GITHUB}/releases/tag/base-{level}"}
        if failed not in refs:
            return None
        words = _git("for-each-ref", "--format=%(contents)", failed, cwd=code, timeout=20).stdout
        return _failed(level, words)
    r = _git("ls-remote", "origin", tag, failed, cwd=repo, timeout=60)
    if r.returncode:
        return None
    refs = {line.split("\t")[1] for line in r.stdout.splitlines() if "\t" in line}
    if tag in refs:
        return {"level": level, "ok": True, "run": f"{GITHUB}/releases/tag/base-{level}"}
    if failed not in refs:
        return None
    _git("fetch", "-q", "origin", f"+{failed}:{failed}", cwd=repo, timeout=60)
    words = _git("for-each-ref", "--format=%(contents)", failed, cwd=repo, timeout=20).stdout
    return _failed(level, words)


def _newer_published(repo: Path, level: str) -> str:
    """The newest published level above `level` (a tag base-X.Y.Z), or "" when there is none."""
    if _through_guard():
        r = _git("for-each-ref", "--format=%(refname)", "refs/upstream/tags/", cwd=_app_dir(), timeout=20)
        names = r.stdout.split()
    else:
        r = _git("ls-remote", "--tags", "origin", "refs/tags/base-*", cwd=repo, timeout=60)
        names = [ln.split("\t")[1] for ln in r.stdout.splitlines() if "\t" in ln] if not r.returncode else []
    mine = tuple(int(x) for x in level.split("."))
    found = []
    for name in names:
        m = re.fullmatch(r"refs/(?:upstream/)?tags/base-(\d+)\.(\d+)\.(\d+)", name)
        if m and tuple(map(int, m.groups())) > mine:
            found.append(tuple(map(int, m.groups())))
    return ".".join(map(str, max(found))) if found else ""


def _failed(level: str, words: str) -> dict:
    what = next((ln[len("What failed: "):] for ln in words.splitlines() if ln.startswith("What failed: ")), "")
    run = next((ln[len("The run: "):] for ln in words.splitlines() if ln.startswith("The run: ")), "")
    pr = next((ln[len("The pull request: "):] for ln in words.splitlines() if ln.startswith("The pull request: ")), "")
    return {"level": level, "ok": False, "what": what, "run": run, "pr": pr}


def _ref_words(repo: Path, ref: str) -> str | None:
    """The message of the annotated tag `ref` (refs/...), or None when there is no such ref."""
    if _through_guard():
        code, ref = _app_dir(), ref.replace("refs/", "refs/upstream/", 1)
        r = _git("for-each-ref", "--format=%(refname)%00%(contents)", ref, cwd=code, timeout=20)
        name, _, words = r.stdout.partition("\0")
        return words if name.strip() == ref else None
    r = _git("ls-remote", "origin", ref, cwd=repo, timeout=60)
    if r.returncode or not r.stdout.strip():
        return None
    _git("fetch", "-q", "--no-tags", "origin", f"+{ref}:{ref}", cwd=repo, timeout=60)
    return _git("for-each-ref", "--format=%(contents)", ref, cwd=repo, timeout=20).stdout


def main_level(repo: Path) -> str:
    """The level main holds (its deploy/container/base/line.json), or ""."""
    try:
        return str(json.loads((repo / STATE / "line.json").read_text()).get("level") or "")
    except (OSError, ValueError):
        return ""


def _waiting_run(repo: Path, level: str) -> str:
    """The run whose publish of `level` waits for the owner's yes: from the tag the merge job
    leaves, else from GitHub's public list of waiting runs, else ""."""
    words = _ref_words(repo, WAITING.format(level=level)) or ""
    run = next((ln[len("The run: "):].strip() for ln in words.splitlines() if ln.startswith("The run: ")), "")
    if run:
        return run
    try:
        doc = github_org.read_json(WAITING_API, headers={"Accept": "application/vnd.github+json",
                                                         "User-Agent": "Rouh base patches"}, timeout=20)
    except Exception:  # noqa: BLE001 - unsigned reads are often refused (60 an hour); tried again later
        return ""
    for r in doc.get("workflow_runs") or []:
        if r.get("head_branch") == BRANCH.format(level=level) and r.get("html_url"):
            return str(r["html_url"])
    return ""


def held(repo: Path, rec: dict) -> dict | None:
    """The level main holds when it passed its checks and is not published yet: its publish is
    waiting for the owner's approval. Kept in the record as ``waiting``; None (and taken out of the
    record) when main's level is published, failed, or not to be read."""
    level = main_level(repo)
    got = _result(repo, level) if level else {"ok": True}
    if got is not None:
        was = rec.pop("waiting", None)
        if was and was.get("level") == level and got.get("ok"):
            rec["published"] = {"level": level, "at": time.time()}
        return None
    kept = rec.get("waiting") or {}
    if kept.get("level") != level:
        kept = {"level": level, "since": time.time()}
    if not kept.get("run"):
        kept["run"] = _waiting_run(repo, level)
    rec["waiting"] = kept
    return kept


def waiting_link(waiting: dict) -> str:
    """Where the owner approves it: the run's page, whose Review deployments button it is."""
    return waiting.get("run") or f"{RUNS}?query=is%3Awaiting"


def waiting_line(waiting: dict, queued: str = "") -> str:
    """The Clockwork line, and the scheduled-jobs check's, for a level waiting for its approval."""
    line = f"base {waiting['level']} passed its checks and is waiting for your approval to publish"
    return line + (f"; {queued} is queued behind it" if queued else "") + f" ({waiting_link(waiting)})"


def _failure_words(result: dict, plan: dict | None) -> str:
    steps = result.get("what") or "the build did not finish"
    what = ", ".join(f"{c['what']} {c['from'] or '(new)'} -> {c['to']}" for c in (plan or {}).get("changes", [])[:8])
    sec = len((plan or {}).get("security") or [])
    if sec:
        what = (what + "; " if what else "") + f"{sec} Debian security updates"
    return (f"Base {result.get('level')} was not published, so every Rouh stays on the base it has. "
            f"It was to bring: {what or 'what the last look found'}. What failed: {steps}. "
            f"The run: {result.get('run') or _runs_of(result.get('level', ''))}"
            + (f"; its pull request stays open: {result['pr']}" if result.get("pr") else ""))


def _runs_of(level: str) -> str:
    """The Base image runs of one level's branch."""
    return f"{RUNS}?query=branch%3Abase-patch%2F{level}"


async def _tell_waiting(who, rec: dict, waiting: dict, queued: str) -> None:
    """One notice for one level waiting for the owner's approval, never twice."""
    from . import notices

    level = waiting["level"]
    told = set(rec.get("told_waiting") or [])
    if level in told:
        return
    link = waiting_link(waiting)
    now_on = (rec.get("published") or {}).get("level") or ""
    body = (f"Base {level} passed its checks on Intel and Arm and is merged into main"
            + (f"; base {queued} is queued behind it" if queued else "")
            + f". Its last step, Publish {level}, waits for your yes in GitHub's release-signing environment: "
            f"open the run, press Review deployments, tick release-signing and approve. Until then every Rouh "
            f"stays on {'base ' + now_on if now_on else 'the base it has'}"
            + (f", and base {queued} starts as soon as this one is done" if queued else "")
            + f". The run: {link}")
    phone = (f"Rouh's base {level} passed its checks and is waiting for your approval to publish"
             + (f"; {queued} is queued behind it" if queued else "") + f". {link}")
    await notices.notify(title=f"Base {level} is waiting for your approval to publish", body=body, link=link,
                         link_label="Review deployments", kind="base_patch", key=f"base-waiting-{level}",
                         phone_text=phone, who=who)
    told.add(level)
    rec["told_waiting"] = sorted(told)[-40:]


async def _tell(who, rec: dict, level: str, words: str, link: str) -> None:
    """One notice for one failed level, never twice (Petar's N1)."""
    from . import notices

    told = set(rec.get("told") or [])
    if level in told:
        return
    await notices.notify(title=f"Base {level} failed its checks and was not published", body=words,
                         link=link, link_label="The pull request" if "/pull/" in link else "The run", kind="base_patch", key=f"base-patch-{level}",
                         phone_text=f"Rouh's base {level} failed its checks and was not published. {link}",
                         who=who)
    told.add(level)
    rec["told"] = sorted(told)[-40:]


async def _settle(who, rec: dict, repo: Path, *, tell: bool = True) -> str:
    """What became of the level pushed last, and of the one main holds, said once: "" while the
    level pushed last is still being built and nothing waits."""
    was = (rec.get("waiting") or {}).get("level")
    waiting = held(repo, rec)
    pending = rec.get("pending")
    if was and not waiting and (rec.get("published") or {}).get("level") == was:
        done = f"base {was} was approved and is published"
        if not pending:
            return done
        return done + "; " + await _settle_pending(who, rec, repo, pending)
    if pending and waiting and pending["level"] == waiting["level"]:
        # The level pushed last passed and is merged: now it is the one waiting.
        rec.pop("pending", None)
        pending = None
    if waiting:
        queued = pending["level"] if pending and _result(repo, pending["level"]) is None else ""
        if queued:
            # base.yml's runs go one at a time: this one has not started, so it is not timed out.
            pending["queued"] = True
        if tell or queued:
            await _tell_waiting(who, rec, waiting, queued)
        if not queued and pending:
            return await _settle_pending(who, rec, repo, pending)
        return waiting_line(waiting, queued)
    if not pending:
        return ""
    return await _settle_pending(who, rec, repo, pending)


async def _settle_pending(who, rec: dict, repo: Path, pending: dict) -> str:
    got = _result(repo, pending["level"])
    newer = _newer_published(repo, pending["level"]) if got is None else ""
    if newer:
        # Replaced, not failed: on 11 November 2026 base 1.0.13 was cancelled while it waited for
        # its approval, and 1.0.14 was cut on top of it and published. Nobody is told it failed.
        rec.pop("pending", None)
        rec["published"] = {"level": newer, "at": time.time()}
        return f"base {pending['level']} was replaced by base {newer}, which is published"
    if got is None and pending.pop("queued", None):
        # The one ahead of it is done, so its run starts now: its three hours start now too.
        pending["pushed_at"] = time.time()
        return f"base {pending['level']} is being built and checked, now that the one ahead of it is done"
    if got is None:
        if time.time() - pending.get("pushed_at", 0) < WATCH_FOR:
            return f"base {pending['level']} is still being built and checked"
        # Nothing is known to have failed: said here, the next night pushes it again, nobody is woken.
        rec.pop("pending", None)
        return (f"base {pending['level']} has not said how it went in three hours and is not published; "
                f"no job is known to have stopped on an error; the next night tries it again ({_runs_of(pending['level'])})")
    rec.pop("pending", None)
    if got.get("ok"):
        rec["published"] = {"level": got["level"], "at": time.time()}
        return f"base {got['level']} passed every check and is published"
    await _tell(who, rec, got["level"], _failure_words(got, pending.get("plan")),
                got.get("pr") or got.get("run") or _runs_of(got["level"]))
    return f"base {got['level']} failed its checks and was not published; the owner was told"


def _report(repo: Path) -> str:
    """The level's plan.json in words, as base_patch.py says it."""
    r = subprocess.run(["python3", str(_app_dir() / "deploy" / "container" / "base_patch.py"), "report",
                        str(repo / STATE)], capture_output=True, text=True, timeout=60)
    return r.stdout if r.returncode == 0 else ""


def _urgent(plan: dict) -> bool:
    if plan.get("security"):
        return True
    return any(c["what"] in ("Python", "Node", "@openai/codex", "PostgreSQL") for c in plan.get("changes", []))


def _why(text: str) -> str:
    """What a failed script said, as the line that says why: a traceback's last line (the error,
    whole, with the path it names), never its frames or the tail of a frame cut in half."""
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return "it said nothing"
    if any(ln.startswith("Traceback") for ln in lines):
        return lines[-1][:300]
    return " ".join(lines)[-300:]


def _look(repo: Path) -> dict:
    script = _app_dir() / "deploy" / "container" / "base_patch.py"
    # The base image has no uv, so base_patch.py installs its pinned one here, once. Without it every
    # night from the move to the containers stopped on FileNotFoundError: '/usr/local/bin/uv'.
    env = dict(os.environ, ROUH_UV_DIR=str(home() / "uv"))
    r = subprocess.run(["python3", str(script), "look", str(repo / STATE), "--write", "--json"], capture_output=True,
                       text=True, timeout=1800, env=env)
    if r.returncode:
        raise RuntimeError(f"the look failed: {_why(r.stderr or r.stdout)}")
    return json.loads(r.stdout)


async def night(who, *, trying: bool = False) -> str:
    """Tonight's look, and the build it starts: the line Clockwork says it did."""
    rec = record()
    try:
        repo = await asyncio.to_thread(_state)
    except Exception as e:  # noqa: BLE001 - said on the row
        return f"could not look: {e}"
    # A level waiting for approval is told after tonight's push, if any, so the notice can say what
    # is queued behind it.
    settled = await _settle(who, rec, repo, tell=False)
    _keep(rec)
    pending = rec.get("pending")
    if pending:
        if not pending.get("queued") and time.time() - pending.get("pushed_at", 0) < WATCH_EVERY:
            asyncio.ensure_future(_watch(who, pending["level"]))
        return settled
    said = await _night_look(who, rec, repo, settled, trying)
    waiting, pending = rec.get("waiting"), rec.get("pending")
    if waiting:
        queued = pending["level"] if pending else ""
        if queued:
            pending["queued"] = True
        await _tell_waiting(who, rec, waiting, queued)
        _keep(rec)
        if queued:
            said = said.replace(f"base {queued} is a pull request on main, being built and checked",
                                f"base {queued} is a pull request on main, queued behind base {waiting['level']}")
    return said


async def _night_look(who, rec: dict, repo: Path, settled: str, trying: bool) -> str:
    """Tonight's look, and the level it pushes."""
    if not (repo / STATE / "line.json").exists():
        return f"main has no base line in {STATE}: run the Base image workflow by hand with cut, such as 1.1"
    try:
        plan = await asyncio.to_thread(_look, repo)
    except Exception as e:  # noqa: BLE001
        return (settled + "; " if settled else "") + f"could not look: {e}"
    left = len(plan.get("left_for_genes") or [])
    later = f"{left} updates newer than a patch are left for genes" if left else "nothing is newer than a patch"
    if not plan.get("changed"):
        _git("checkout", "-q", "--", ".", cwd=repo)
        return (settled + "; " if settled else "") + f"nothing new for base {plan['from_level']}; {later}"
    last = (rec.get("published") or {}).get("at") or 0
    if not _urgent(plan) and time.time() - last < LIBRARIES_WAIT and not trying:
        _git("checkout", "-q", "--", ".", cwd=repo)
        n = len(plan.get("changes") or [])
        return ((settled + "; " if settled else "") +
                f"{n} library patches wait for this week's base; nothing urgent; {later}")
    words = "; ".join(f"{c['what']} {c['from'] or '(new)'} -> {c['to']}" for c in plan["changes"][:20])
    if plan.get("security"):
        words += ("; " if words else "") + f"{len(plan['security'])} Debian security updates"
    branch = BRANCH.format(level=plan["level"])
    _git("checkout", "-q", "-B", branch, cwd=repo)
    _git("add", "-A", "--", str(STATE), cwd=repo)
    r = _git("-c", "user.name=Rouh", "-c", "user.email=rouh@localhost", "commit", "-q", "-m",
             f"base {plan['level']}: {words[:180]}", "-m", _report(repo)[:4000], cwd=repo)
    if r.returncode:
        return f"could not commit base {plan['level']}: {r.stderr.strip()[-300:]}"
    why = await asyncio.to_thread(push_level, repo, branch)
    if why:
        return f"could not push base {plan['level']} for its pull request: {why}"
    rec["pending"] = {"level": plan["level"], "branch": branch, "pushed_at": time.time(), "plan": plan}
    # Each try of a level is told once if it fails, a level tried again included.
    rec["told"] = [t for t in rec.get("told") or [] if t != plan["level"]]
    _keep(rec)
    asyncio.ensure_future(_watch(who, plan["level"]))
    return ((settled + "; " if settled else "") +
            f"found {len(plan['changes'])} patch-level updates and {len(plan.get('security') or [])} Debian security "
            f"updates; base {plan['level']} is a pull request on main, being built and checked; {later}")


def push_level(repo: Path, branch: str) -> str:
    """The level committed in `repo` pushed as `branch`: "" when it is, else why not. A level
    tried again: the word that the last try failed is taken back, and the branch (and so its open
    pull request) carries the new try. In the containers the protected core checks it and pushes
    it (guard/rouh_guard/upstream.py, push_branch), and takes the failure word back itself."""
    level = branch.split("/", 1)[-1]
    if _through_guard():
        from . import guardface

        sha = _git("rev-parse", "HEAD", cwd=repo, timeout=20).stdout.strip()
        # Forced: the ref is only how the commit reaches /code, and a level tried again is cut afresh
        # on rouh-core's main as it is now, so it is never on top of the last try. Without the force
        # the second try of 1.0.13 (10 November 2026) was refused as "behind its remote counterpart".
        r = _git("push", "-q", "--force", str(_app_dir()), f"HEAD:refs/base-patch/{level}", cwd=repo)
        if r.returncode:
            return f"the level could not be handed to the protected core: {r.stderr.strip()[-300:]}"
        try:
            guardface.ask("push_branch", commit=sha, branch=branch, why=f"base {level}", timeout=3600)
        except guardface.Refused as e:
            return f"the protected core did not push it: {e}"
        except guardface.Unavailable as e:
            return str(e)
        return ""
    _git("push", "-q", "origin", ":" + FAILED.format(level=level), cwd=repo)
    r = _git("push", "-q", "--force", "origin", f"HEAD:refs/heads/{branch}", cwd=repo)
    return r.stderr.strip()[-300:] if r.returncode else ""


async def _watch(who, level: str) -> None:
    """The level just pushed, watched until its result is written, so a failure is told tonight."""
    end = time.time() + WATCH_FOR
    while time.time() < end:
        await asyncio.sleep(WATCH_EVERY)
        try:
            rec = record()
            if (rec.get("pending") or {}).get("level") != level:
                return
            repo = await asyncio.to_thread(_state)
            if _result(repo, level) is None and main_level(repo) != level:
                continue
            said = await _settle(who, rec, repo)
            _keep(rec)
            log.info("the base patch job: %s", said)
            return
        except Exception:  # noqa: BLE001 - the next night takes it up
            log.exception("watching base %s failed; the next night takes it up", level)
            return
