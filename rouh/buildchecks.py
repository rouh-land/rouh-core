"""The checks a change of Rouh's code passes before it goes live: one list, run by every route.

Petar, 28 November 2026: "everything needs to be streamlined through one build process, yes?" Until
then the checks were written in `land.sh` (ten guard functions in bash) and only there. A run in the
containers lands through `bin/rouh-land`, which ran land.sh with every guard turned off when it had
to fit the work, ran none of them when it did not, and only its own copy of the design check; a
bundle handed with `guard/bin/rouh-propose` reached the protected core with no check at all; and the
protected core's own check of Rouh (`rouh/selfcheck/own.py`) ran two of the ten. The Apps screens
(e00939c5, 8c545287) went live that way.

So the checks are written here, once, and every route only calls this:

- **land.sh** (a checkout on a server) runs every check before it pushes (`build_checks`).
- **bin/rouh-land** (a run in the containers' worker) runs every check before it hands the change
  over, fitted or not, and sends the design record with it.
- **rouh/codechanges.py** (the core, every proposal whoever handed it) runs the `diff` checks with
  the code that runs, before it asks the protected core: they read only git, so nothing of the
  proposed change is executed in the core. `rouh/code_evolution.py` does the same for a master
  change it adapts.
- **rouh/selfcheck/own.py** (inside the protected core's sandbox, on a copy of the proposed commit)
  runs every `code` check with `--all`: they execute the change's own code, which the sandbox is for.

Two kinds of check:

- `diff` checks read git only (what changed between two commits, and their files): a box's secret
  committed, one number for one task, every file owned by a gene, the design record. They run the
  modules of the `--home` folder (the code that runs, or a copy of the change on a worker).
- `code` checks run the change's own code, in a copy of it (`git archive` of `--after`, or the
  folder given with `--tree`): the page's types, the mail replay, the LLM service, the old server's
  layout, the gene contract, the use signals.

Each check runs only when the change touches its paths, as each guard did, unless `--all`.

    python -m rouh.buildchecks run --repo R --before B --after A [--record F | --record-json J]
                                   [--kinds diff,code] [--all] [--tree DIR] [--home DIR]
    python -m rouh.buildchecks list

It prints one line per check on stderr and a last line on stdout, `BUILDCHECKS {...}`: `ok`, the
checks that ran and passed, and on a failure `failed` with its `key`, the `flag` land.sh answers with
(`types=false`, `duplicate=true` ...) and `why`, the sentence that is said. It stops at the first
failure, as land.sh did. Standard library only, so it runs from a bare copy.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

HOME = Path(__file__).resolve().parents[1]

#: The page's own script and what it is typed against (land.sh's TYPED_PATHS).
TYPED_PATHS = ("rouh/static/app.js", "rouh/static/app", "rouh/static/vad.d.ts", "tsconfig.json", "tools/typecheck")
#: How Rouh handles trusted contacts' mail and messages (MAIL.md, D9; land.sh's MAIL_PATHS).
MAIL_PATHS = ("rouh/mail_cases.py", "rouh/mail_ledger.py", "rouh/mail_outbox.py", "rouh/mail_replay.py",
              "rouh/mail_turn.py", "rouh/mail_alerts.py", "rouh/grants.py", "rouh/trusted.py", "rouh/reminders.py",
              "rouh/telegram_guests.py", "rouh/telegram_chat.py", "rouh/case_dry_run.py", "rouh/case_fixes.py",
              "rouh/case_trace.py", "rouh/decision_sources.py", "rouh/testing/mail_replay.json",
              "rouh/management/commands/case_follow_up.py", "rouh/clockwork_grants.py", "rouh/timekeeper.py",
              "rouh/case_actions.py", "rouh/capabilities.py", "rouh/capabilities.lock.json",
              "rouh/capability_grants.py", "rouh/genes/manifests")
#: The gene registry and the page that draws its navigation (land.sh's GENE_PATHS).
GENE_PATHS = ("rouh/genes", "rouh/templates/rouh/index.html", "rouh/templates/rouh/_nav_row.html",
              "rouh/static/app", "rouh/static/app.js")
PYTHON = ("rouh/*.py", "rouh/**/*.py")
#: Rouh's code without the page: what a Python check needs of the change.
NO_PAGE = ("rouh", ":!rouh/static", ":!rouh/templates")


class Failed(Exception):
    """A check that did not pass: the sentence said, and the flag land.sh answers with."""

    def __init__(self, why: str, flag: str = "") -> None:
        super().__init__(why)
        self.why = why
        self.flag = flag


@dataclass
class Ctx:
    repo: str = ""
    before: str = ""
    after: str = ""
    record: str = ""
    record_json: str = ""
    every: bool = False
    tree: str = ""
    home: Path = HOME
    py: str = sys.executable or "python3"
    said: list[str] = field(default_factory=list)
    _tmp: list[str] = field(default_factory=list)

    def say(self, text: str) -> None:
        self.said.append(text)
        print(f"buildchecks: {text}", file=sys.stderr, flush=True)

    def git(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(["git", "-c", "safe.directory=*", "-C", self.repo, *args],
                              capture_output=True, text=True)

    def has(self, path: str) -> bool:
        """Whether the change holds this file (the commit `after`, or the tree)."""
        if self.tree:
            return (Path(self.tree) / path).exists()
        return self.git("cat-file", "-e", f"{self.after}:{path}").returncode == 0

    def changed(self, *paths: str) -> list[str]:
        """The files of `paths` this change touches; everything under `--all`."""
        if self.every:
            return [paths[0] if paths else "(every file)"]
        got = self.git("diff", "--name-only", self.before, self.after, "--", *paths)
        return [p for p in got.stdout.split("\n") if p.strip()]

    def copy(self, *specs: str) -> Path:
        """A folder holding the change's files under `specs`: the tree itself, or an archive of it."""
        if self.tree:
            return Path(self.tree)
        out = Path(tempfile.mkdtemp(prefix="buildchecks-"))
        self._tmp.append(str(out))
        arch = subprocess.run(["git", "-c", "safe.directory=*", "-C", self.repo, "archive", self.after, "--", *specs],
                              capture_output=True)
        subprocess.run(["tar", "-x", "-C", str(out)], input=arch.stdout, capture_output=True)
        return out

    def module(self, where: Path, *args: str, env: dict | None = None) -> tuple[int, str]:
        got = subprocess.run([self.py, *args], cwd=str(where), capture_output=True, text=True,
                             env={**os.environ, **(env or {})})
        return got.returncode, (got.stdout + got.stderr)

    def clean(self) -> None:
        for d in self._tmp:
            shutil.rmtree(d, ignore_errors=True)


def _last(text: str) -> str:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return lines[-1].strip() if lines else ""


def _first_fail(text: str) -> str:
    return next((ln for ln in text.splitlines() if ln.startswith("FAIL")), _last(text))


# --- the checks, in the order land.sh asked them ---------------------------------------------


def secrets(c: Ctx) -> str:
    """A box handed to a job is never committed, in any commit about to be pushed."""
    if c.tree:
        found = sorted(str(p.relative_to(c.tree)) for p in Path(c.tree).rglob(".secrets"))[:3]
    else:
        names = c.git("log", "--format=", "--name-only", f"{c.before}..{c.after}").stdout.split("\n")
        found = sorted({n for n in names if re.search(r"(^|/)\.secrets(/|$)", n)})[:3]
    if found:
        raise Failed("Nothing was pushed: a commit about to be pushed holds a box handed to a job "
                     f"({','.join(found)}). A box's file in .secrets is never committed; take it out of the "
                     "branch's history and land again.", "secrets=true")
    return ""


def numbers(c: Ctx) -> str:
    """One number, one task (`rouh/numbering.py`): no task number or object id on a second folder."""
    if c.tree or not (c.home / "rouh" / "numbering.py").is_file():
        return "not a history to number"
    rc, said = c.module(c.home, "-m", "rouh.numbering", "check", "--repo", c.repo, "--before", c.before,
                        "--after", c.after)
    if rc:
        raise Failed(_last(said) or "one number, one task: this landing would give a number to two folders",
                     "duplicate=true")
    return ""


def types(c: Ctx) -> str:
    """The page's types: `tsc --noEmit` over the page (tools/typecheck/check.sh)."""
    if not c.has("tools/typecheck/check.sh"):
        return "no type checker in this code"
    changed = c.changed(*TYPED_PATHS)
    if not changed:
        return "the page's script is not changed"
    c.say(f"checking the page's types, since this changes {changed[0]}")
    copy = c.copy(*TYPED_PATHS)
    # The checker is the home's when it has one (the code that runs, in the core), so a proposed
    # change's own script is never what runs there; else the change's (a worker's copy of it).
    script = c.home / "tools/typecheck/check.sh"
    if not script.is_file() or c.tree:
        script = copy / "tools/typecheck/check.sh"
    got = subprocess.run(["bash", str(script), str(copy)], capture_output=True, text=True, timeout=600)
    said = (got.stdout + got.stderr).replace(str(copy) + "/", "")
    if got.returncode == 0:
        return "the page's types check"
    if "error TS" not in said:
        why = ("npm is not installed here" if "npm is not installed" in said
               else "TypeScript could not be installed or run here: " + _last(said)[:160])
        if c.tree:
            # Inside the protected core's sandbox (no npm, no network): said plainly, never taken for a
            # pass. The same check ran in the worker (bin/rouh-land) and in the core
            # (rouh/codechanges.py) before the change reached the sandbox.
            return f"the page's types are not checked in this sandbox ({why}); bin/rouh-land and the core check them"
        raise Failed(f"Nothing was pushed: the page's types could not be checked: {why}", "types=false")
    errors = said.count("error TS")
    first = next((ln for ln in said.splitlines() if ln.strip()), "")
    raise Failed(f"Nothing was pushed: the page's type check (tools/typecheck/check.sh) did not pass, "
                 f"{errors} error{'s' if errors != 1 else ''}. The first: {first}", "types=false")


def _python(c: Ctx, *, need: str, paths: tuple, specs: tuple, module: str, doing: str, ok: str, bad: str,
            flag: str, first_line=_first_fail) -> str:
    if not c.has(need):
        return f"no {need} in this code"
    changed = c.changed(*paths)
    if not changed:
        return "nothing it checks is changed"
    if doing:
        c.say(f"{doing}, since this changes {changed[0]}")
    copy = c.copy(*specs)
    rc, said = c.module(copy, "-m", module)
    last = _last(said)
    if rc == 0:
        return f"{ok}: {last}"
    raise Failed(bad.format(last=last.rstrip("."), first=first_line(said)), flag)


def mail(c: Ctx) -> str:
    """The mail replay (`python -m rouh.mail_replay`): every kept case comes out as it must."""
    return _python(c, need="rouh/mail_replay.py", paths=MAIL_PATHS, specs=NO_PAGE, module="rouh.mail_replay",
                   doing="replaying the mail cases", ok="the mail replay",
                   bad="Nothing was pushed: the mail replay (python -m rouh.mail_replay) did not pass: {last}. "
                       "The first: {first}", flag="mail=false")


def llm(c: Ctx) -> str:
    """Every call to a model goes through the LLM service (`python -m rouh.llmguard`)."""
    return _python(c, need="rouh/llmguard.py", paths=PYTHON, specs=NO_PAGE, module="rouh.llmguard",
                   doing="checking every model call goes through the LLM service", ok="the LLM service",
                   bad="Nothing was pushed: a model is asked or named past the LLM service (python -m rouh.llmguard): "
                       "{last}. The first: {first}", flag="llm=false")


def host(c: Ctx) -> str:
    """No code tied to the old server's layout without saying why (`python -m rouh.hostguard`)."""
    return _python(c, need="rouh/hostguard.py", paths=("rouh", "one", "bin"),
                   specs=("rouh", "one", "bin", ":!rouh/static"), module="rouh.hostguard", doing="",
                   ok="the old server's layout",
                   bad="Nothing was pushed: code names the old server's layout without saying why "
                       "(python -m rouh.hostguard): {first}", flag="hosts=false")


def genes(c: Ctx) -> str:
    """The gene contract (`python -m rouh.genes`): the navigation is drawn from the manifests only."""
    return _python(c, need="rouh/genes/__main__.py", paths=GENE_PATHS,
                   specs=("rouh/__init__.py", "rouh/genes", "rouh/capabilities.py", "rouh/capabilities.lock.json",
                          "rouh/handholding.py", "rouh/handholding.json",
                          "rouh/templates/rouh", "rouh/static"),
                   module="rouh.genes", doing="checking the gene contract", ok="the gene contract",
                   bad="Nothing was pushed: the gene contract (python -m rouh.genes) does not hold: {last}. "
                       "The first: {first}", flag="genes=false")


def owners(c: Ctx) -> str:
    """Every file belongs to a gene (`rouh/genes/owners.py`, the map at the change's own commit)."""
    if c.tree:
        if not (Path(c.tree) / "rouh/genes/owners.py").is_file():
            return "no gene map in this code"
        rc, said = c.module(Path(c.tree), "-m", "rouh.genes.owners", "check")
    else:
        if not c.has("rouh/genes/owners.py") or not (c.home / "rouh/genes/owners.py").is_file():
            return "no gene map in this code"
        rc, said = c.module(c.home, "-m", "rouh.genes.owners", "changed", "--repo", c.repo, "--before", c.before,
                            "--after", c.after)
    first = next((ln for ln in said.splitlines() if ln.strip()), "")
    if rc == 0:
        return first
    raise Failed("Nothing was pushed: " + (first or "the gene ownership map could not be read"), "owners=false")


def design(c: Ctx) -> str:
    """The design standard (`rouh/design_standard.py`): a change to the screen lands with a design
    record that passes, or a commit line that says it shows nothing new."""
    if os.environ.get("ROUH_DESIGN_GUARD", "1") != "1":
        return "turned off here (ROUH_DESIGN_GUARD=0)"
    if c.tree:
        return "needs the change's history, so it is checked where the history is"
    if not (c.home / "rouh/design_standard.py").is_file():
        return "no design standard in this code"
    record = c.record
    if c.record_json:
        fd, record = tempfile.mkstemp(prefix="design-record-", suffix=".json")
        os.write(fd, c.record_json.encode())
        os.close(fd)
        c._tmp.append(record)
    args = ["-m", "rouh.design_standard", "check", "--repo", c.repo, "--before", c.before, "--after", c.after]
    rc, said = c.module(c.home, *args, "--record", record or os.devnull)
    if rc == 0:
        return _last(said)
    raise Failed("Nothing was pushed: " + _last(said), "design=false")


def signals(c: Ctx) -> str:
    """How a gene says it was used (`python -m rouh.genes.signals`)."""
    return _python(c, need="rouh/genes/signals.py", paths=PYTHON + ("rouh/genes",), specs=NO_PAGE,
                   module="rouh.genes.signals", doing="checking how each gene says it was used",
                   ok="the use signals",
                   bad="Nothing was pushed: a gene does not say how it was used (python -m rouh.genes.signals): "
                       "{last}. The first: {first}", flag="signals=false")


@dataclass(frozen=True)
class Check:
    key: str
    kind: str          # "diff": reads git only; "code": runs the change's own code
    name: str
    run: Callable[[Ctx], str]


#: Every check a change passes, in order. One list: land.sh, bin/rouh-land, rouh/codechanges.py,
#: rouh/code_evolution.py and rouh/selfcheck/own.py all run it from here.
CHECKS = (
    Check("secrets", "diff", "no box's secret committed", secrets),
    Check("numbers", "diff", "one number, one task", numbers),
    Check("types", "code", "the page's types", types),
    Check("mail", "code", "the mail replay", mail),
    Check("llm", "code", "the LLM service", llm),
    Check("host", "code", "the old server's layout", host),
    Check("genes", "code", "the gene contract", genes),
    Check("owners", "diff", "every file belongs to a gene", owners),
    Check("design", "diff", "the design standard", design),
    Check("signals", "code", "how each gene says it was used", signals),
)
KINDS = ("diff", "code")


def run(ctx: Ctx, kinds=KINDS, only=None, skip=()) -> dict:
    """Runs the checks of `kinds` in order, stopping at the first that fails. The answer as a dict."""
    ran, notes = [], {}
    try:
        for chk in CHECKS:
            if chk.kind not in kinds or (only and chk.key not in only) or chk.key in skip:
                continue
            try:
                note = chk.run(ctx)
            except Failed as f:
                ctx.say(f.why)
                return {"ok": False, "ran": ran, "notes": notes,
                        "failed": {"key": chk.key, "name": chk.name, "flag": f.flag, "why": f.why}}
            ran.append(chk.key)
            notes[chk.key] = note
            if note and not note.startswith(("no ", "nothing", "the page's script is not", "not a history")):
                ctx.say(note)
        return {"ok": True, "ran": ran, "notes": notes}
    finally:
        ctx.clean()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="The checks every change passes before it goes live.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--repo", default="")
    r.add_argument("--before", default="")
    r.add_argument("--after", default="HEAD")
    r.add_argument("--record", default="")
    r.add_argument("--record-json", default="")
    r.add_argument("--kinds", default="diff,code")
    r.add_argument("--only", default="")
    r.add_argument("--skip", default="")
    r.add_argument("--all", action="store_true", help="every check, whatever the change touches")
    r.add_argument("--tree", default="", help="check this folder as the change (no history: code checks)")
    r.add_argument("--home", default="", help="where the diff checks' modules come from")
    sub.add_parser("list")
    a = ap.parse_args(argv)
    if a.cmd == "list":
        for chk in CHECKS:
            print(f"{chk.key:8} {chk.kind:5} {chk.name}")
        return 0
    if not a.tree and not (a.repo and a.before):
        ap.error("run needs --repo and --before, or --tree")
    ctx = Ctx(repo=a.repo, before=a.before, after=a.after, record=a.record, record_json=a.record_json,
              every=a.all or bool(a.tree), tree=a.tree, home=Path(a.home).resolve() if a.home else HOME)
    if a.repo and not a.tree:
        ctx.after = ctx.git("rev-parse", a.after).stdout.strip() or a.after
    got = run(ctx, kinds=tuple(k for k in a.kinds.split(",") if k),
              only=set(filter(None, a.only.split(","))) or None, skip=set(filter(None, a.skip.split(","))))
    print("BUILDCHECKS " + json.dumps(got, ensure_ascii=False))
    return 0 if got["ok"] else 1


def answer(text: str) -> dict | None:
    """The BUILDCHECKS line of a run's output, read back."""
    for line in reversed(text.splitlines()):
        if line.startswith("BUILDCHECKS "):
            try:
                return json.loads(line[len("BUILDCHECKS "):])
            except ValueError:
                return None
    return None


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["CHECKS", "Check", "Ctx", "Failed", "KINDS", "answer", "main", "run"]
