"""Four genes for building Rouh faster (night 55 of the ledger, 26 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
helps build Rouh faster. Each has its own switch:

- **A run finds a ready test world on its machine** (`world_ready`, invisible). Every run of Rouh's
  code in the worker made a `.venv-e2e` or linked one by hand, and made a PostgreSQL 18 with
  micromamba, before it could prove anything: the nights' notes carried the recipe. Now
  ``./e2e.sh`` links another checkout's ready `.venv-e2e` whose requirements match, and
  ``./e2e.sh serve`` finds or makes one PostgreSQL shared by every run of the machine, so
  `ROUH_PG_BIN` is set by itself; ``./e2e.sh ready`` does both and says so. While the switch is
  on, a run of Rouh's code is told so in its brief (`world_note`, asked by
  `workspace_repo.code_run_note`), so it does not spend its first ten minutes on it.
- **Fix it, on an error Rouh shows** (`error_fix`, shows up by itself). An error on Rouh's screen
  became a screenshot and a typed brief. Now a red error notice, for the owner who can start runs
  of Rouh's own code, carries Fix it: Start a run opens on Rouh's code with the error's words,
  the screen's address and the page's recent script errors already in the brief.
- **Take it back** (`run_undo`, you ask for it). A run that landed something unwanted was undone by
  finding its commit and writing a revert brief. Now a landed run's head has Take it back, which
  opens Start a run in its workspace with that brief written.
- **Make it a run** (`chat_to_run`, changes how you work). What the person dictates in the chat
  about changing Rouh was typed again into Start a run. Now each of their own messages has Make it
  a run, which opens Start a run on Rouh's own code with the message as the brief.

Nothing starts by itself: the three on the page open Start a run, and the person presses Start.
The page is told which are on in `#rouhBuildFaster` (`for_page`); each reports its use through
``POST /api/build-faster`` (`rouh/web/build_faster.py`), and `world_ready` from the brief. No model
is asked, and nothing is kept here.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger("rouh.build_faster")

#: Each gene's switch, its title, and the events the page reports (`world_ready`'s is the server's).
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "world_ready": ("A run finds a ready test world on its machine", ()),
    "error_fix": ("Fix it, on an error Rouh shows", ("opened", "started")),
    "run_undo": ("Take it back: undo what a run landed", ("opened", "started")),
    "chat_to_run": ("Make it a run, from your own chat message", ("opened", "started")),
}

#: The workspace of Rouh's own code in Start a run (`starting.workspaces`).
CODE = "rouh"


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def for_page(who) -> dict:
    """What `#rouhBuildFaster` tells the page: which are on, and the workspace a change of Rouh's
    own code starts a run in ("" where this Rouh has no code of its own to change)."""
    from .config import config

    return {"on": on_for(who), "code": CODE if getattr(config, "app_dir", "") else ""}


# --- world_ready ---------------------------------------------------------------------------------

#: What a run of Rouh's code is told about its test world in the containers.
WORLD_NOTE = (
    "A test world needs no setting up by hand on this machine: `./e2e.sh serve` links a ready "
    "`.venv-e2e` from another checkout here when its requirements match, and finds or makes the "
    "machine's one shared PostgreSQL for test worlds, so ROUH_PG_BIN is set by itself. "
    "`./e2e.sh ready` does both and prints what it used; run it once before your first world.")


def world_note(who=None) -> str:
    """What a run of Rouh's code is told about its test world, while `world_ready` is on and the
    run is in the containers' worker (`ROUH_WORKSPACE_ORIGIN`); "" elsewhere, or off."""
    from . import switches

    if not (os.environ.get("ROUH_WORKSPACE_ORIGIN") or "").strip():
        return ""
    if not switches.on("world_ready", _org(who)):
        return ""
    from . import evolution

    evolution.used("world_ready", "briefed", who=who, detail="e2e.sh ready")
    return WORLD_NOTE


# --- what the page reports ---------------------------------------------------------------------


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the page's three used: counted, nothing else. False for one not known, an event it
    does not report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if (switch, event) == ("error_fix", "opened"):
        evolution.used("error_fix", "opened", who=who, detail=detail)
    elif switch == "error_fix":
        evolution.used("error_fix", "started", who=who, detail=detail)
    elif (switch, event) == ("run_undo", "opened"):
        evolution.used("run_undo", "opened", who=who, detail=detail)
    elif switch == "run_undo":
        evolution.used("run_undo", "started", who=who, detail=detail)
    elif (switch, event) == ("chat_to_run", "opened"):
        evolution.used("chat_to_run", "opened", who=who, detail=detail)
    else:
        evolution.used("chat_to_run", "started", who=who, detail=detail)
    return True
