"""Four genes for building Rouh faster (night 57 of the ledger, 28 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
helps build Rouh faster. Each has its own switch:

- **A run's brief carries the screen's errors too** (`screen_errors`, invisible). Rouh's own
  server errors already reach a run's brief (`build_flow.errors_brief`), but what broke in the
  person's browser never did: a script error on the screen, or a request the server answered
  with a failure. Now the page reports each one here, it is kept in memory for two hours (secrets
  taken out, the same one said again kept once with how many times), and a run of Rouh's own code
  is handed the newest at the end of its brief (`starting.start`).
- **A failed request says so, with Fix it** (`request_broke`, shows up by itself). A press whose
  request Rouh's server answered with a failure (500 and over) usually did nothing visible. Now
  the screen says so once, with Fix it, which opens Start a run on Rouh's code with the request,
  its answer and the screen written, or Copy the details where this Rouh has no code to change.
- **What went wrong on this screen** (`screen_trouble`, you ask for it). The menu's What went
  wrong here lists every script error and failed request this screen had since it was opened,
  with Fix them in one run and Copy the details; an empty list says nothing went wrong.
- **What a good brief says, as you write it** (`brief_check`, changes how you work). Start a run
  on Rouh's code shows four marks under the brief: where it is, what is wrong, what it should do
  instead, and how to see it; each is ticked as the words for it are typed, with a short line of
  what is still missing, so a brief is complete before a run spends an hour guessing.

The page is told which are on in `#rouhBuildMore` (`for_page`); each reports its use through
``POST /api/build-more`` and the screen's errors through ``POST /api/build-more/trouble``
(`rouh/web/build_more.py`). No model is asked.
"""
from __future__ import annotations

import collections
import logging
import threading
import time

log = logging.getLogger("rouh.build_more")

#: Each gene's switch, its title, and the events the page reports (`screen_errors`' is the server's).
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "screen_errors": ("A run's brief carries the screen's errors too", ()),
    "request_broke": ("A failed request says so, with Fix it", ("opened", "copied")),
    "screen_trouble": ("What went wrong on this screen", ("opened", "fixed")),
    "brief_check": ("What a good brief says, as you write it", ("complete",)),
}

#: The workspace of Rouh's own code in Start a run (`build_faster.CODE`).
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
    """What `#rouhBuildMore` tells the page: which are on, and the workspace a change of Rouh's own
    code starts in ("" where this Rouh has none)."""
    from .config import config

    on = on_for(who)
    return {"on": on, "code": CODE if getattr(config, "app_dir", "") else ""}


# --- screen_errors -------------------------------------------------------------------------------

#: How many of the newest a brief is given, how old the oldest may be, and how many are kept a Rouh.
MOST = 10
WITHIN = 2 * 3600
KEPT = 40

_kept: dict[str, collections.deque] = {}
_lock = threading.Lock()


def _clean(text, most: int = 300) -> str:
    from .build_flow import SECRET

    line = " ".join(str(text or "").split())
    return SECRET.sub("[taken out]", line)[:most]


def report(who, kind: str, what: str, where: str = "", screen: str = "") -> bool:
    """One thing that went wrong on the person's screen, as the page saw it: kept in memory for a
    run's brief. False when it is off or not one of the two kinds."""
    from . import switches

    if who is None or kind not in ("script", "request") or not str(what or "").strip():
        return False
    if not switches.on("screen_errors", _org(who)):
        return False
    entry = {"at": time.time(), "kind": kind, "what": _clean(what), "where": _clean(where, 200),
             "screen": _clean(screen, 160)}
    key = str(_org(who) or "")
    with _lock:
        held = _kept.setdefault(key, collections.deque(maxlen=KEPT))
        same = next((e for e in held if e["kind"] == kind and e["what"] == entry["what"]
                     and e["where"] == entry["where"]), None)
        if same is not None:
            same["times"] += 1
            same["at"] = entry["at"]
            same["screen"] = entry["screen"] or same["screen"]
        else:
            held.append(dict(entry, times=1))
    return True


def latest(org_id: str | None, now: float | None = None) -> list[dict]:
    """The newest kept for this organisation, at most `MOST`, none older than `WITHIN`, oldest first."""
    now = time.time() if now is None else now
    with _lock:
        held = list(_kept.get(str(org_id or ""), ()))
    recent = sorted((e for e in held if now - float(e["at"]) <= WITHIN), key=lambda e: e["at"])
    return [dict(e) for e in recent[-MOST:]]


def errors_section(org_id: str | None = None) -> str:
    """What a run of Rouh's own code is told about what broke on the person's screens lately, while
    `screen_errors` is on; "" when it is off or nothing did."""
    from . import switches

    org = org_id or None
    if not switches.on("screen_errors", org):
        return ""
    if org is None:
        from .modeldefaults import org_now

        org = str(org_now() or "") or None
    found = latest(org)
    if not found:
        return ""
    lines = ["## What broke on the person's screen lately",
             "",
             "The person's browser reported these in the last two hours, newest last: a script error of "
             "Rouh's own page, or a request Rouh's server answered with a failure. They may have nothing "
             "to do with this brief: use them where they help, and say in your report if one was the cause.",
             ""]
    for e in found:
        when = time.strftime("%H:%M:%S UTC", time.gmtime(float(e["at"])))
        times = f" ({e['times']} times)" if e["times"] > 1 else ""
        kind = "Script error" if e["kind"] == "script" else "Failed request"
        on = f", on {e['screen']}" if e["screen"] else ""
        at = f" [{e['where']}]" if e["where"] else ""
        lines.append(f"- {when}{times}, {kind}{on}: {e['what']}{at}")
    from . import evolution

    evolution.used("screen_errors", "briefed", detail=f"{len(found)} screen errors in a run's brief")
    return "\n".join(lines)


def for_code_run(where: dict, preset: str, org_id: str | None = None) -> str:
    """The section for a run starting on Rouh's own code, from the Start box (its workspace is
    Rouh's code) or as gene therapy; "" for any other run."""
    if preset != "improve_myself" and str(where.get("space") or "") != CODE:
        return ""
    try:
        return errors_section(org_id)
    except Exception:  # noqa: BLE001 - a run is never held back for this
        log.exception("screen_errors: the screen's errors could not be put in the brief")
        return ""


# --- what the page reports -----------------------------------------------------------------------


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the page's uses: counted, nothing else. False for one not known, an event the page
    does not report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if (switch, event) == ("request_broke", "opened"):
        evolution.used("request_broke", "opened", who=who, detail=detail)
    elif (switch, event) == ("request_broke", "copied"):
        evolution.used("request_broke", "copied", who=who, detail=detail)
    elif (switch, event) == ("screen_trouble", "opened"):
        evolution.used("screen_trouble", "opened", who=who, detail=detail)
    elif switch == "screen_trouble":
        evolution.used("screen_trouble", "fixed", who=who, detail=detail)
    else:
        evolution.used("brief_check", "complete", who=who, detail=detail)
    return True


__all__ = ["GENES", "errors_section", "for_code_run", "for_page", "latest", "on_for", "report", "used"]
