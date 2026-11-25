"""Four genes for building Rouh faster (night 54 of the ledger, 25 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
helps build Rouh faster. Each has its own switch:

- **A run's brief says how to reach the workspace from where it is** (`brief_workspace`,
  invisible). A run of Rouh's code that writes into the workspace was told to make its checkout
  with ``git -C /srv/spaces/workspace ...``, a path the worker container has not had since
  31 October 2026, so every night and every mutation run failed its first command, searched, and
  cloned the workspace's main by hand. Now, in the containers (`ROUH_WORKSPACE_ORIGIN`), the
  brief names the copy the run can reach and the commands that work there, and says that the
  landing's "NOT live" about the live workspace is expected, since Rouh's own copy follows main by
  itself (`rouh/workspace_follow.py`). `workspace_repo.code_run_note` asks `container_note`.
- **The pictures a run took, on its head** (`run_pictures`, shows up by itself). A run proves its
  change in a test world and takes screenshots, which went with its checkout. Now the one program
  keeps them as the checkout goes (`one/proof.py`), and a run's head shows them, each a press
  away from full size: the proof is seen, not only told.
- **See it live** (`run_screens`, you ask for it). A run that changed a screen checked it with its
  design record, which names each address. Now a run's head lists those screens, each a press that
  opens it in this Rouh.
- **Change something here** (`point_change`, changes how you work). A request to change Rouh's
  screen was a description of where on it ("the button under the chip"). Now Change something
  here, in the menu or with Alt+Shift+C, lets the person press the thing itself, and Start a run
  opens on Rouh's own code with the screen's address, the thing's words and where it is already in
  the brief (`describe`, on the page): they say only what should change.

The page is told which are on in `#rouhBuildProof` (`for_page`); `run_pictures` and `run_screens`
read the ``proof`` message of the one program; each reports its use through
``POST /api/build-proof`` (`rouh/web/build_proof.py`), and `brief_workspace` from the brief. No
model is asked, and nothing is kept here.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger("rouh.build_proof")

#: Each gene's switch, its title, and the events the page reports (`brief_workspace`'s is the server's).
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "brief_workspace": ("A run's brief says how to reach the workspace from where the run is", ()),
    "run_pictures": ("The pictures a run took, on its head", ("seen", "opened")),
    "run_screens": ("See it live: the screens a run changed, one press from its head", ("opened",)),
    "point_change": ("Point at something on Rouh's screen to start a run about it", ("pointed", "started")),
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
    """What `#rouhBuildProof` tells the page: which are on, and the workspace a change of Rouh's
    own screen starts a run in."""
    from .config import config

    return {"on": on_for(who), "code": CODE if getattr(config, "app_dir", "") else ""}


# --- brief_workspace -----------------------------------------------------------------------------

#: What a run in a checkout of Rouh's code is told about the workspace in the containers, where the
#: workspace's main is the repository `{origin}` and Rouh's live copy follows it by itself.
CONTAINER_NOTE = (
    "The person's workspace is not in this checkout: it is a repository of its own, which this "
    "machine reaches at {origin}. Make a checkout of it beside this one - `git clone -q {origin} "
    "\"$PWD-workspace\" && git -C \"$PWD-workspace\" checkout -q -b <your branch>-workspace` - "
    "and every path below written `<workspace>/...` is in that checkout. Commit the workspace's "
    "files there, never here, and land them with `./land.sh --path \"$PWD-workspace\"` from this "
    "checkout; say what it said. Here its last line says the work is on main and NOT live, because "
    "moving the live workspace was turned off for that landing: that is expected, since Rouh's own "
    "copy of the workspace follows main by itself within a minute.")


def origin() -> str:
    """The workspace's main as a run in the containers reaches it, or "" off the containers."""
    return (os.environ.get("ROUH_WORKSPACE_ORIGIN") or "").strip()


def container_note(who=None) -> str:
    """What a run of Rouh's code is told about the workspace in the containers, while
    `brief_workspace` is on; "" elsewhere, or off, and the old note stands."""
    from . import switches

    where = origin()
    if not where or not switches.on("brief_workspace", _org(who)):
        return ""
    from . import evolution

    evolution.used("brief_workspace", "briefed", who=who, detail=where)
    return CONTAINER_NOTE.format(origin=where)


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
    if (switch, event) == ("run_pictures", "seen"):
        evolution.used("run_pictures", "seen", who=who, detail=detail)
    elif switch == "run_pictures":
        evolution.used("run_pictures", "opened", who=who, detail=detail)
    elif switch == "run_screens":
        evolution.used("run_screens", "opened", who=who, detail=detail)
    elif (switch, event) == ("point_change", "pointed"):
        evolution.used("point_change", "pointed", who=who, detail=detail)
    else:
        evolution.used("point_change", "started", who=who, detail=detail)
    return True
