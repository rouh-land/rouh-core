"""Four genes for building Rouh faster (night 56 of the ledger, 27 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
helps build Rouh faster. Each has its own switch:

- **A run's brief carries Rouh's latest errors** (`errors_brief`, invisible). What went wrong in
  Rouh's own process is in its log, which a run of Rouh's code cannot read from the worker, and
  the person never sees. Now the last few errors of the last two hours (when, where, the first
  line and the kind of error, with anything like a key taken out) are kept in memory, and a run
  of Rouh's own code is handed them at the end of its brief (`starting.start`).
- **A broken screen says so, with Fix it** (`page_broke`, shows up by itself). A script error on
  Rouh's own page was silent: the screen just stopped doing something. Now the page says so once,
  with Fix it, which opens Start a run on Rouh's code with the error and where it happened, and
  Copy the details where this Rouh has no code of its own to change.
- **See it on a phone, from the desk** (`phone_view`, you ask for it). The menu's See it on a phone
  shows the screen you are on in a phone-sized frame, live, beside the desk.
- **Save it for the next run** (`run_later`, changes how you work). Start a run on Rouh's code has
  Save for later; the next time it opens on Rouh's code it says how many are saved, and Add them
  puts them into the brief, so small fixes go in one run instead of one run, one landing and one
  deploy each. They are kept for the person in `user_settings` (`SAVED`).

The page is told which are on in `#rouhBuildFlow` (`for_page`); each reports its use through
``POST /api/build-flow`` (`rouh/web/build_flow.py`). No model is asked.
"""
from __future__ import annotations

import collections
import json
import logging
import re
import threading
import time

log = logging.getLogger("rouh.build_flow")

#: Each gene's switch, its title, and the events the page reports (`errors_brief`'s is the server's).
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "errors_brief": ("A run's brief carries Rouh's latest errors", ()),
    "page_broke": ("A broken screen says so, with Fix it", ("opened", "copied", "started")),
    "phone_view": ("See it on a phone, from the desk", ("opened",)),
    "run_later": ("Save it for the next run", ("saved", "added")),
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
    """What `#rouhBuildFlow` tells the page: which are on, the workspace a change of Rouh's own
    code starts in ("" where this Rouh has none), and how many briefs are saved for later."""
    from .config import config

    on = on_for(who)
    return {"on": on, "code": CODE if getattr(config, "app_dir", "") else "",
            "saved": len(saved(who)) if "run_later" in on else 0}


# --- errors_brief --------------------------------------------------------------------------------

#: How many of the newest errors a brief is given, and how old the oldest may be, in seconds.
MOST = 10
WITHIN = 2 * 3600

#: Anything that looks like a key, a token or a password, taken out before a line is kept.
SECRET = re.compile(r"(sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9]{12,}|xox[a-z]-[A-Za-z0-9\-]{8,}"
                    r"|AIza[0-9A-Za-z_\-]{20,}|eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-.]+"
                    r"|(?i:(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)\S+)")

_kept: collections.deque = collections.deque(maxlen=60)
_lock = threading.Lock()


def _clean(text: str) -> str:
    line = " ".join(str(text or "").split())
    return SECRET.sub("[taken out]", line)[:300]


class _Keeper(logging.Handler):
    """Keeps the newest errors of Rouh's own process, in memory only."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            first = str(record.getMessage()).splitlines()[0] if record.getMessage() else ""
            kind = ""
            if record.exc_info and record.exc_info[0] is not None:
                exc = record.exc_info[1]
                kind = f"{record.exc_info[0].__name__}: {str(exc).splitlines()[0] if str(exc) else ''}"
            entry = {"at": record.created, "where": f"{record.name} ({record.module}.py:{record.lineno})",
                     "said": _clean(first), "kind": _clean(kind)}
            with _lock:
                _kept.append(entry)
        except Exception:  # noqa: BLE001 - a handler never raises
            pass


_handler: _Keeper | None = None


def listen() -> None:
    """Start keeping errors, once, at Rouh's start (`runtime`). Keeping costs nothing when off:
    the switch is read only when a brief is written."""
    global _handler
    if _handler is not None:
        return
    _handler = _Keeper(level=logging.ERROR)
    logging.getLogger().addHandler(_handler)


def latest(now: float | None = None) -> list[dict]:
    """The newest errors kept, at most `MOST`, none older than `WITHIN`, oldest first; the same
    error said again is one line with how many times."""
    now = time.time() if now is None else now
    with _lock:
        recent = [e for e in _kept if now - float(e["at"]) <= WITHIN]
    out: list[dict] = []
    for e in recent:
        same = next((o for o in out if o["where"].split(" ")[0] == e["where"].split(" ")[0]
                     and o["said"] == e["said"]), None)
        if same is not None:
            same["times"] += 1
            same["at"] = e["at"]
        else:
            out.append(dict(e, times=1))
    return out[-MOST:]


def errors_section(org_id: str | None = None, who=None) -> str:
    """What a run of Rouh's own code is told about the errors Rouh's process logged lately, while
    `errors_brief` is on; "" when it is off or there were none."""
    from . import switches

    if not switches.on("errors_brief", org_id or _org(who)):
        return ""
    found = latest()
    if not found:
        return ""
    lines = ["## Rouh's latest errors",
             "",
             "Rouh's own server logged these errors in the last two hours, newest last. They may have "
             "nothing to do with this brief: use them where they help, and say in your report if one "
             "of them was the cause.",
             ""]
    for e in found:
        when = time.strftime("%H:%M:%S UTC", time.gmtime(float(e["at"])))
        times = f" ({e['times']} times)" if e["times"] > 1 else ""
        lines.append(f"- {when}{times}, {e['where']}: {e['said'] or '(no words)'}"
                     + (f" [{e['kind']}]" if e["kind"] else ""))
    from . import evolution

    evolution.used("errors_brief", "briefed", who=who, detail=f"{len(found)} errors in a run's brief")
    return "\n".join(lines)


def for_code_run(where: dict, preset: str, org_id: str | None = None) -> str:
    """The section for a run starting on Rouh's own code, from the Start box (its workspace is
    Rouh's code) or as gene therapy; "" for any other run."""
    if preset != "improve_myself" and str(where.get("space") or "") != CODE:
        return ""
    try:
        return errors_section(org_id)
    except Exception:  # noqa: BLE001 - a run is never held back for this
        log.exception("errors_brief: the errors could not be put in the brief")
        return ""


# --- run_later -----------------------------------------------------------------------------------

#: The `user_settings` row the saved briefs are kept in, and how many may wait.
SAVED = "build_flow.saved"
LIMIT = 20


def saved(who) -> list[dict]:
    """The briefs this person saved for the next run, oldest first."""
    from .models import UserSetting

    if who is None:
        return []
    value = (UserSetting.objects.filter(user_id=str(who.user_id), org_id=who.org_id or "", name=SAVED)
             .values_list("value", flat=True).first())
    try:
        held = json.loads(value) if value else []
    except (TypeError, ValueError):
        held = []
    return [h for h in held if isinstance(h, dict) and str(h.get("brief") or "").strip()] if isinstance(held, list) else []


def _keep(who, held: list[dict]) -> None:
    from .models import UserSetting

    UserSetting.objects.bulk_create(
        [UserSetting(user_id=str(who.user_id), org_id=who.org_id or "", name=SAVED,
                     value=json.dumps(held[-LIMIT:]), updated_at=time.time())],
        update_conflicts=True, unique_fields=["user_id", "name"],
        update_fields=["org_id", "value", "updated_at"])


def save(who, brief: str) -> int | None:
    """Keep one brief for the next run; how many are saved now, or None when it is off or empty."""
    from . import evolution, switches

    brief = str(brief or "").strip()[:8000]
    if who is None or not brief or not switches.on("run_later", _org(who)):
        return None
    held = [h for h in saved(who) if h.get("brief") != brief]
    held.append({"brief": brief, "at": time.time()})
    _keep(who, held)
    evolution.used("run_later", "saved", who=who, detail=brief.splitlines()[0][:120])
    return len(held[-LIMIT:])


def take(who) -> list[dict]:
    """Every saved brief, handed over once and forgotten: they are going into a run's brief now."""
    from . import evolution, switches

    if who is None or not switches.on("run_later", _org(who)):
        return []
    held = saved(who)
    if held:
        _keep(who, [])
        evolution.used("run_later", "added", who=who, detail=f"{len(held)} saved briefs into one run")
    return held


def drop(who, index: int) -> int | None:
    """Forget one saved brief by its place in the list; how many are left."""
    from . import switches

    if who is None or not switches.on("run_later", _org(who)):
        return None
    held = saved(who)
    if 0 <= index < len(held):
        held.pop(index)
        _keep(who, held)
    return len(held)


# --- what the page reports -----------------------------------------------------------------------


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the page's uses of `page_broke` or `phone_view`: counted, nothing else. False for one
    not known, an event the page does not report, or a switch that is off."""
    from . import evolution, switches

    if switch not in ("page_broke", "phone_view") or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if (switch, event) == ("page_broke", "opened"):
        evolution.used("page_broke", "opened", who=who, detail=detail)
    elif (switch, event) == ("page_broke", "copied"):
        evolution.used("page_broke", "copied", who=who, detail=detail)
    elif switch == "page_broke":
        evolution.used("page_broke", "started", who=who, detail=detail)
    else:
        evolution.used("phone_view", "opened", who=who, detail=detail)
    return True
