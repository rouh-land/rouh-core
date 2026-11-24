"""Four genes for building Rouh faster, around a run's brief (night 53 of the ledger, 24 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
helps build Rouh faster. Each has its own switch:

- **A page's path with its address** (`brief_links`, invisible). A brief that names a page by its
  address in Rouh ("fix the table on http://.../task/94-53") reached the run as an address it
  cannot open, being behind the sign-in, so the run asked or guessed the folder. Now each of
  Rouh's own addresses for a workspace page in the brief of a run in the assistant's workspace has
  the page's path written after it (`with_paths`), the way `page_comments` reads one.
- **Filed under the task its brief names** (`run_task`, shows up by itself). A run started from
  Start a run belongs to nothing and reports in General, though its brief says "task 94" or
  "94-53". Now its head says which task or step the brief names, with File it there, which
  attaches the run to it (the same `attach` Move sends). Only for a run that belongs to nothing
  and names exactly one task that exists (`named`).
- **Start a run on this page** (`page_run`, you ask for it). A change to a page that is more than
  Ask AI makes in one go is a run: Metabolism, New run, the workspace, the page's path typed by
  hand, then Move. Now the page's Share menu has Start a run on this page: Start a run opens with
  the assistant's workspace, the page's step and path in the brief, and the run is filed under
  the page's task when it starts.
- **Pictures with the brief** (`brief_pictures`, changes how you work). A screenshot of what is
  wrong is the quickest brief, and Start a run took words only. Now a picture pasted or dropped on
  the brief is listed under it, and once the run has started it is put where the run can read it
  and given at its prompt as an attachment, the way a file dropped on its terminal is
  (`one/drops.py`).

The page is told which are on in `#rouhRunBrief` (`for_page`); `with_paths` is asked by the
`start_run` message (`rouh/runtime.py`); each reports its use through `POST /api/run-brief`
(`rouh/web/run_brief.py`). No model is asked, and nothing is kept.
"""
from __future__ import annotations

import logging
import os
import re
from urllib.parse import parse_qs, urlsplit

log = logging.getLogger("rouh.run_brief")

#: Each gene's switch, its title, and the events it reports.
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "brief_links": ("A page's address in a run's brief gets its path in the workspace", ("started",)),
    "run_task": ("A run whose brief names a task offers to file it there", ("filed", "seen")),
    "page_run": ("Start a run on this page, from a page's Share menu", ("opened", "started")),
    "brief_pictures": ("Pictures pasted into a run's brief go with the run", ("started",)),
}

#: The workspace a run of the assistant works in, as Start a run names it (`starting.workspaces`).
ASSISTANT = "assistant"

#: An address in a brief: a whole URL, or one of Rouh's own paths written on its own.
_ADDRESS = re.compile(r"(?:https?://[^\s<>()\[\]\"']+|(?<![\w/.])/(?:task|project|pages|workspace)/[^\s<>()\[\]\"']+)")

#: How a brief names a task: "task 94", "task #94", or a step "94-53".
_TASK = re.compile(r"\btask\s*#?(\d{1,5})(?:-(\d{1,3}))?\b", re.I)
_STEP = re.compile(r"(?<![\w.-])(\d{1,5})-(\d{2,3})(?![\w-])")

#: Pictures with a brief: how many, and how big each may be (a drop's own limit, `one/drops.py`).
PICTURES_MOST = 6
PICTURE_BYTES = 20_000_000


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def for_page(who) -> dict:
    """What `#rouhRunBrief` tells the page: which are on, and what a brief's pictures may be."""
    return {"on": on_for(who), "pictures": {"most": PICTURES_MOST, "bytes": PICTURE_BYTES}}


# --- brief_links -------------------------------------------------------------------------------


def _page_path(root: str, address: str) -> str:
    """The workspace path of the page one of Rouh's own addresses names, or ''."""
    from . import page_comments

    parts = urlsplit(address if "://" in address else "http://x" + address)
    if not parts.path.startswith(("/task/", "/project/", "/pages/", "/workspace/")):
        return ""
    try:
        rel = page_comments._from_address(parts.path, parse_qs(parts.query))  # noqa: SLF001 - the one reading of an address
    except Exception:  # noqa: BLE001 - an address it cannot read is left as it was
        return ""
    rel = str(rel or "").strip("/")
    if not rel or ".." in rel.split("/"):
        return ""
    try:
        return page_comments.page_of(root, rel)
    except Exception:  # noqa: BLE001 - not a page: a task's own folder is said as a folder
        return rel + "/" if os.path.isdir(os.path.join(root, rel)) else ""


def with_paths(brief: str, workspace: str, who=None, *, root: str | None = None) -> str:
    """`brief` with the workspace path of each page it names by Rouh's address written after the
    address, while `brief_links` is on and the run is the assistant's, in its workspace. A path
    the brief already holds is not written again. The brief is otherwise word for word."""
    from . import switches

    brief = str(brief or "")
    if workspace != ASSISTANT or not brief or not switches.on("brief_links", _org(who)):
        return brief
    if root is None:
        from . import page_comments
        from .config import config

        root = page_comments.workspace_root(config)
    if not root:
        return brief
    added: list[str] = []
    # What the brief says outside its addresses: a path written there already is not written again.
    # (An address of Rouh's often holds the path itself, which the run cannot tell is one.)
    said = _ADDRESS.sub(" ", brief)

    def put(m: re.Match) -> str:
        address = m.group(0).rstrip(".,;:!?")
        tail = m.group(0)[len(address):]
        rel = _page_path(root, address)
        if not rel or rel in said or rel in added:
            return m.group(0)
        added.append(rel)
        return f"{address} (in the workspace: {rel}){tail}"

    out = _ADDRESS.sub(put, brief)
    if added:
        from . import evolution

        evolution.used("brief_links", "started", who=who, detail=", ".join(added)[:300])
    return out


# --- run_task ----------------------------------------------------------------------------------


def named(brief: str) -> list[str]:
    """The tasks and steps a brief names, in order, each once: "94" for "task 94", "94-53" for a
    step. The page does the same (`runTaskNamed` in app/runs.js); this is the rule written once,
    for the stack test."""
    out: list[str] = []
    text = str(brief or "")
    for m in _TASK.finditer(text):
        key = m.group(1) + (f"-{m.group(2)}" if m.group(2) else "")
        if key not in out:
            out.append(key)
    for m in _STEP.finditer(text):
        key = f"{m.group(1)}-{m.group(2)}"
        if key not in out:
            out.append(key)
    return out


def one_task(brief: str) -> str:
    """The one task a brief is about, by number, or '' when it names none or several."""
    tasks = {key.split("-")[0] for key in named(brief)}
    if len(tasks) != 1:
        return ""
    steps = [key for key in named(brief) if "-" in key]
    return steps[0] if len(steps) == 1 else next(iter(tasks))


# --- what the page reports ---------------------------------------------------------------------


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the page's used: counted, nothing else. False for one not known, an event it does not
    report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None or switch == "brief_links":
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if switch == "run_task":
        if event == "filed":
            evolution.used("run_task", "filed", who=who, detail=detail)
        else:
            evolution.used("run_task", "seen", who=who, detail=detail)
    elif switch == "page_run":
        if event == "opened":
            evolution.used("page_run", "opened", who=who, detail=detail)
        else:
            evolution.used("page_run", "started", who=who, detail=detail)
    else:
        evolution.used("brief_pictures", "started", who=who, detail=detail)
    return True
